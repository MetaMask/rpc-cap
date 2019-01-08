const ObservableStore = require('obs-store')
var equal = require('fast-deep-equal')

const UNAUTHORIZED_ERROR = {
  message: 'Unauthorized to perform action',
  code: 1,
}
const METHOD_NOT_FOUND = {
  code: -32601,
  messages: 'Method not found',
}

class JsonRpcCapabilities {

  constructor({ safeMethods = [], restrictedMethods = {}, initState = {}, methods = {}, methodPrefix = ''}, promptUserForPermissions) {
    this.safeMethods = safeMethods
    this.restrictedMethods = restrictedMethods
    this.methods = methods
    this.promptUserForPermissions = promptUserForPermissions

    this.internalMethods = {}
    this[`${methodPrefix}getPermissions`] = this.getPermissionsMiddleware.bind(this)
    this[`${methodPrefix}requestPermissions`] = this.requestPermissionsMiddleware.bind(this)
    this[`${methodPrefix}grantPermissions`] = this.grantPermissionsMiddleware.bind(this)
    this[`${methodPrefix}revokePermissions`] = this.revokePermissionsMiddleware.bind(this)
    // TODO: Freeze internal methods object.

    this.store = new ObservableStore(initState)
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

    // skip registered safe/passthrough methods
    if (this.safeMethods.includes(methodName)) {
      return next()
    }

    if (methodName in this.internalMethods) {
      console.log('calling internal method')
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
    console.log('getting permission for ' + domain)
    const { domains } = this.store.getState()
    console.dir(domains)
    if (domain in domains) {
      const { permissions } = domains[domain]
      return permissions
    }
    return {}
  }

  _getPermission (domain, method) {
    const permissions = this._getPermissions(domain)
    console.dir(permissions)
    if (method in permissions) {
      return permissions[method]
    }
    console.dir(permissions)
    throw new Error('Domain unauthorized to use method ' + method)
  }

  get _permissionsRequests () {
    return this.memStore.getState().permissionsRequests
  }

  set _permissionsRequests (permissionsRequests) {
    this.memStore.putState({ permissionsRequests })
  }

  /*
   * Adds the request to the requestedPermissions array, for user approval.
   */
  _requestPermissions (req, res, next, end) {
    // TODO: Validate permissions request
    const requests = this._permissionsRequests
    requests.push(params[0])
    this._permissionsRequests = requests
    this.promptUserForPermissions(req, res, next, end)
  }

  async grantNewPermissions (permissions) {
    // Remove any matching requests from the queue:
    this._permissionsRequests = this._permissionsRequests.filter((request) => {
      return equal(permissions, request)
    })

    // Update the related permission objects:
    let officialPerms = this._permissions
    officialPerms.forEach((permission) => {
      officialPerms[permission.method] = permission
    })
    this._permissions = officialPerms
  }

  set _permissions (permissions) {
    this.store.putState(permissions)
  }

  getPermissionsMiddleware (req, res, next, end) {
    res.result = JSON.stringify(this._permissions)
    end()
  }

  requestPermissionsMiddleware (req, res, next, end) {
    const params = req.params
    this._requestPermissions(params)
    if (this.promptUserForPermissions) {
      this.promptUserForPermissions(params, end)
    } else {
      res.result = 'Request submitted.'
      end()
    }
  }

  grantPermissionsMiddleware (domain, req, res, next, end) {
    res.error = { message: 'Method not implemented' }
    end(res.error)
  }

  revokePermissionsMiddleware (domain, req, res, next, end) {
    res.error = { message: 'Method not implemented' }
    end(res.error)
  }
}

module.exports = JsonRpcCapabilities

