const ObservableStore = require('obs-store')
var equal = require('fast-deep-equal')

class EthLoginController {

  constructor({ origin = '', safeMethods = [], initState = {}, methods = {}}) {
    this.origin = origin
    this.safeMethods = safeMethods
    this.methods = methods

    this.store = new ObservableStore(initState)
    this.permissionsRequests = []
  }

  serialize () {
    return this.store.getState()
  }

  async requestPermissions (permissions) {
    this.permissionsRequests.push(permissions)
  }

  async grantNewPermissions (permissions) {
    // Remove any matching requests from the queue:
    this.permissionsRequests = this.permissionsRequests.filter((request) => {
      return equal(permissions, request)
    })

    // Update the related permission objects:
    let officialPerms = this._permissions
    officialPerms.forEach((permission) => {
      officialPerms[permission.method] = permission
    })
    this._permissions = officialPerms
  }

  get _permissions () {
    const { permissions } = this.store.getState()
    return permissions
  }

  set _permissions (permissions) {
    this.store.putState(permissions)
  }

  /*
   * The method by which middleware filters which methods
   * meet its requirements or not.
   */
  async requestMethod(req, res, next) {
    const permission = this._permissions[req.method]
    if (!permission) {
      res.error = 'Origin unauthorized to use ' + req.method
      throw new Error(res.error)
    }

    const { prereq } = permission
    if (prereq) {
      const met = await prereq(req, res)
      if (!met) {
        res.error = 'Failed to authorize ' + req.method
        throw new Error(res.error)
      }
    }
    res = await this._callMethod(req, res, next)
    return res
  }

  async _callMethod(req, res, next) {
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

  providerMiddlewareFunction (req, res, next, end) {
    const method = req.method

    // skip registered safe/passthrough methods
    if (this.safeMethods.includes(method)) {
      return next()
    }

    if (method in this.methods) {
      this.requestMethod(req, res, next)
      .then((result) => {
        res.result = result
        return end()
      })
      .catch((reason) => {
        res.error = {
          message: `Application unauthorized to use method ${method}\n${reason}`,
          // per https://github.com/ethereum/wiki/wiki/JSON-RPC-Error-Codes-Improvement-Proposal
          code: 1,
        }
        return end(res.error)
      })
    } else {
      return next()
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
}

module.exports = EthLoginController
