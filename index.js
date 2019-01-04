var equal = require('fast-deep-equal')

class EthLoginController {

  constructor({ origin = '', safeMethods = [], permissions = {}, methods = {}}) {
    this.origin = origin
    this.safeMethods = safeMethods
    this.permissions = permissions
    this.methods = methods

    this.permissionsRequests = []
  }

  serialize () {
    const { origin, safeMethods, permissions, accounts } = this
    return { origin, safeMethods, permissions, accounts }
  }

  async requestPermissions (permissions) {
    this.permissionsRequests.push(permissions)
  }

  async grantNewPermissions (permissions) {
    this.permissionsRequests = this.permissionsRequests.filter((request) => {
      return equal(permissions, request)
    })

    permissions.forEach((permission) => {
      this.permissions[permission.method] = permission
    })
  }

  /*
   * The method by which middleware filters which methods
   * meet its requirements or not.
   */
  async requestMethod(req, res, next) {
    const permission = this.permissions[req.method]
    if (!permission) {
      res.error = 'Origin unauthorized to use ' + req.method
      throw new Error(res.error)
    }

    const { prereq } = permission
    if (prereq) {
      const met = prereq(req, res)
      if (!met) {
        res.error = 'Failed to authorize ' + req.method
        throw new Error(res.error)
      }
    }
    res = await this._callMethod(req, res, next)
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
        return end(new Error('Unable to provide the requested permissions.\n' + reason))
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
