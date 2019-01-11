const ObservableStore = require('obs-store')
const equal = require('fast-deep-equal')
const clone = require('clone')

const UNAUTHORIZED_ERROR = {
  message: 'Unauthorized to perform action',
  code: 1,
}
const METHOD_NOT_FOUND = {
  code: -32601,
  message: 'Method not found',
}

// TODO: This error code needs standardization:
const USER_REJECTED_ERROR = {
  code: 5,
  message: 'User rejected the request.',
}

class JsonRpcCapabilities {

  constructor({ safeMethods = [], restrictedMethods = {}, initState = {}, methods = {}, methodPrefix = '', requestUserApproval}) {
    this.safeMethods = safeMethods
    this.restrictedMethods = restrictedMethods
    this.methods = methods
    this.requestUserApproval = requestUserApproval

    this.internalMethods = {}
    this.internalMethods[`${methodPrefix}getPermissions`] = this.getPermissionsMiddleware.bind(this)
    this.internalMethods[`${methodPrefix}requestPermissions`] = this.requestPermissionsMiddleware.bind(this)
    this.internalMethods[`${methodPrefix}grantPermissions`] = this.grantPermissionsMiddleware.bind(this)
    this.internalMethods[`${methodPrefix}revokePermissions`] = this.revokePermissionsMiddleware.bind(this)
    // TODO: Freeze internal methods object.

    this.store = new ObservableStore(initState || {})
    this.memStore = new ObservableStore({
      permissionsRequests: [],
    })
  }

  serialize () {
    return this.store.getState()
  }

  /*
   * Returns a nearly json-rpc-engine compatible method.
   * The one difference being the first argument should be
   * a unique string identifying the requesting agent/entity,
   * referred to as `domain` in the code. This allows the function to be curried and converted into a normal json-rpc-middleware function.
   *
   * @param {string} domain - A unique string representing the requesting entity.
   * @param {Object} req - The JSON-RPC compatible request object.
   * @param {string} req.method - The JSON RPC method being called.
   * @param {Object} res - The JSON RPC compatible response object.
   * @param {callback} next - A function to pass the responsibility of handling the request down the json-rpc-engine middleware stack.
   * @param {callback} end - A function to stop traversing the middleware stack, and reply immediately with the current `res`. Can be passed an Error object to return an error.
   */
  providerMiddlewareFunction (domain, req, res, next, end) {
    const methodName = req.method

    // skip registered safe/passthrough methods.
    if (this.safeMethods.includes(methodName)) {
      return next()
    }

    // handle internal methods before any restricted methods.
    if (methodName in this.internalMethods) {
      return this.internalMethods[methodName](domain, req, res, next, end)
    }

    // Traverse any permission delegations
    let permission
    try {
      permission = this._getPermission(domain, methodName)
    } catch (err) {
      res.error = {
        message: err.message,
        code: 1,
      }
      return end(res.error)
    }

    if (!permission) {
      res.error = UNAUTHORIZED_ERROR
      return end(UNAUTHORIZED_ERROR)
    }

    this._executeMethod(req, res, next, end)
  }

  _executeMethod(req, res, next, end) {
    const methodName = req.method
    if (methodName in this.restrictedMethods
       && typeof this.restrictedMethods[methodName].method === 'function') {
      return this.restrictedMethods[methodName].method(req, res, next, end)
    }

    res.error = METHOD_NOT_FOUND
    return end(METHOD_NOT_FOUND)
  }

  _getPermissions (domain) {
    const { domains = {} } = this.store.getState()
    if (domain in domains) {
      const { permissions } = domains[domain]
      return permissions
    }
    return {}
  }

  /*
   * Get the parent-most permission granting the requested domain's method permission.
   */
  _getPermission (domain, method) {
    // TODO: Aggregate & Enforce Caveats at each step.
    // https://w3c-ccg.github.io/ocap-ld/#caveats

    let permissions = this._getPermissions(domain)

    while (permissions && method in permissions) {
      if ('grantedBy' in permissions[method]) {
        permissions = this._getPermissions(permissions[method].grantedBy)
      } else {
        return permissions[method]
      }
    }

    return undefined
  }

  /*
   * Get the permission for that domain and method, not following grantedBy links.
   */
  _getPermissionUnTraversed (domain, method) {
    // TODO: Aggregate & Enforce Caveats at each step.
    // https://w3c-ccg.github.io/ocap-ld/#caveats

    let permissions = this._getPermissions(domain)
    if (permissions && method in permissions) {
      return permissions[method]
    }

    return undefined
  }


  get _permissions () {
    const perms = this.memStore.getState().permissions
    return perms || {}
  }

  get _permissionsRequests () {
    const reqs = this.memStore.getState().permissionsRequests
    return reqs || {}
  }

  set _permissionsRequests (permissionsRequests) {
    this.memStore.updateState({ permissionsRequests })
  }

  /*
   * Used for granting a new set of permissions,
   * after the user has approved it.
   *
   * @param {object} permissions - An object describing the granted permissions.
   */
  grantNewPermissions (domain, permissions, res, end) {
    // Remove any matching requests from the queue:
    this._permissionsRequests = this._permissionsRequests.filter((request) => {
      return equal(permissions, request)
    })

    // Update the related permission objects:
    this._setPermissionsFor(domain, permissions)
    res.result = this._getPermissions(domain)
    end()
  }

  get _domains () {
    const { domains } = this.store.getState()
    return domains || {}
  }

  set _domains (domains) {
    this.store.updateState({ domains })
  }

  _getDomainSettings (domain) {
    const domains = this._domains

    // Setup if not yet existent:
    if (!(domain in domains)) {
      domains[domain] = { permissions: {} }
    }

    return domains[domain]
  }

  _setDomain (domain, domainSettings) {
    const domains = this._domains
    domains[domain] = domainSettings
    const state = this.store.getState()
    state.domains = domains
    this.store.putState(state)
  }

  _setPermissionsFor (domainName, newPermissions) {
    const domain = this._getDomainSettings(domainName)

    const { permissions } = domain

    for (let key in newPermissions) {
      permissions[key] = newPermissions[key]
    }

    domain.permissions = permissions
    this._setDomain(domainName, domain)
  }

  _removePermissionsFor (domainName , permissionsToRemove) {
    const domain = this._getDomainSettings(domainName)

    const { permissions } = domain

    permissionsToRemove.forEach((key) => {
      delete permissions[key]
    })

    domain.permissions = permissions
    this._setDomain(domainName, domain)
  }

  getPermissionsMiddleware (domain, req, res, next, end) {
    const permissions = this._getPermissions(domain)
    res.result = permissions
    end()
  }

  /*
   * The capabilities middleware function used for requesting additional permissions from the user.
   *
   * @param {object} req - The JSON RPC formatted request object.
   * @param {Array} req.params - The JSON RPC formatted params array.
   * @param {object} req.params[0] - An object of the requested permissions.
   */
  requestPermissionsMiddleware (domain, req, res, next, end) {

    // TODO: Validate permissions request
    const options = req.params[0]
    const requests = this._permissionsRequests
    requests.push(options)
    this._permissionsRequests = requests

    if (!this.requestUserApproval) {
      res.result = 'Request submitted.'
      return end()
    }

    this.requestUserApproval(domain, options)
    // TODO: Allow user to pass back an object describing
    // the approved permissions, allowing user-customization.
    .then((approved) => {
      if (!approved) {
        res.error = USER_REJECTED_ERROR
        return end(USER_REJECTED_ERROR)
      }

      return this.grantNewPermissions(domain, options, res, end)
    })
    .catch((reason) => {
      res.error = reason
      return end(reason)
    })
  }

  grantPermissionsMiddleware (domain, req, res, next, end) {
    // TODO: Validate params
    const [ assignedDomain, requestedPerms ] = req.params
    const perms = this._getPermissions(domain)
    const assigned = this._getPermissions(assignedDomain)
    const newlyGranted = {}
    for (const methodName in requestedPerms) {
      const perm = this._getPermission(domain, methodName)
      if (perm) {
        const newPerm = {
          date: Date.now(),
          grantedBy: domain,
        }
        assigned[methodName] = newPerm
        newlyGranted[methodName] = newPerm
      } else {
        res.error = UNAUTHORIZED_ERROR
        return end(UNAUTHORIZED_ERROR)
      }
    }

    this._setPermissionsFor(assignedDomain, assigned)
    res.result = newlyGranted
    end()
  }

  revokePermissionsMiddleware (domain, req, res, next, end) {
    // TODO: Validate params
    const [ assignedDomain, requestedPerms ] = req.params
    const perms = this._getPermissions(domain)
    const assigned = this._getPermissions(assignedDomain)
    const newlyRevoked = []
    for (const methodName in requestedPerms) {
      const perm = this._getPermissionUnTraversed(assignedDomain, methodName)
      if (perm &&
          // Grantors can revoke what they have granted:
         ((perm.grantedBy && perm.grantedBy === domain)
          // Domains can revoke their own permissions:
          || (assignedDomain === domain))) {

        newlyRevoked.push(methodName)
      } else {
        res.error = UNAUTHORIZED_ERROR
        return end(UNAUTHORIZED_ERROR)
      }
    }

    this._removePermissionsFor(assignedDomain, newlyRevoked)
    res.result = newlyRevoked
    end()
  }
}

module.exports = JsonRpcCapabilities

