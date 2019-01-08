const ObservableStore = require('obs-store')
var equal = require('fast-deep-equal')

class JsonRpcCapabilities {

  constructor({ origin = '', safeMethods = [], initState = {}, methods = {}, methodPrefix = ''}, promptUserForPermissions) {
    this.origin = origin
    this.safeMethods = safeMethods
    this.methods = methods
    this.promptUserForPermissions = promptUserForPermissions

    this.internalMethods = {
      `${methodPrefix}getPermissions`: this.getPermissionsMiddleware.bind(this),
      `${methodPrefix}requestPermissions`: this.requestPermissionsMiddleware.bind(this),
      `${methodPrefix}grantPermissions`: this.grantPermissionsMiddleware.bind(this),
    }

    this.store = new ObservableStore(initState)
    this.memStore = new ObservableStore({
      permissionsRequests: [],
    })
  }

  serialize () {
    return this.store.getState()
  }

  providerMiddlewareFunction (domain, req, res, next, end) {
    const methodName = req.method

    // skip registered safe/passthrough methods
    if (this.safeMethods.includes(methodName)) {
      return next()
    }

    if (methodName in this.internalMethods) {
      return this.internalMethods[methodName](domain, req, res, next, end)
    }

    // Traverse any permission delegations
    let method
    try {
      method = this._getPermission(domain, methodName)
    } catch (err) {
      res.error = {
        message: err.message,
        code: 1,
      }
      end(res.error)
    }
  }

  _getPermissions (domain) {
    const { domains } = this.store.getState()
    if (domain in domains) {
      const { permissions } = domains[domain]
      return permissions
    }
    return {}
  }

  _getPermission (domain, method) {
    const permissions = this._getPermissions(domain)
    if (method in permissions) {
      return permissions[method]
    }
    throw new Error('Domain unauthorized to use method ' + method)
  }

  get _permissionsRequests () {
    return this.memStore.getState().permissionsRequests
  }

  set _permissionsRequests (permissionsRequests) {
    this.memStore.putState({ permissionsRequests })
  }

  requestPermissions (req, res, next, end) {
    // TODO: Validate permissions request
    const requests = this._permissionsRequests
    requests.push(params[0])
    this._permissionsRequests = requests
    this.promptUserForPermissions(req, res, next end)
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

  async _callMethod(req, res, next, end) {
    if (req.method in this.methods) {
      return await this.methods[req.method](req, res)
    } else {
      if (next) {
        next()
      } else {
        throw new Error('Method not found and next unavailable.')
      }
    }
  }

  async completePrereqs(permissions) {
    for (let i = 0; i < permissions.length; i++) {
      const met = await permissions[i].prereq()
      if (!met) {
        throw new Error('Request prerequisite not met.')
      }
    }

    return permissions
  }

  getPermissionsMiddleware (req, res, next, end) {
    res.result = JSON.stringify(this._permissions)
    end()
  }

  requestPermissionsMiddleware (req, res, next, end) {
    const params = req.params
    this.requestPermissions(params)
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

}

module.exports = JsonRpcCapabilities

