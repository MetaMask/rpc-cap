const ObservableStore = require('obs-store');
const equal = require('fast-deep-equal');
const clone = require('clone');


const UNAUTHORIZED_ERROR = {
  message: 'Unauthorized to perform action',
  code: 1,
};
const METHOD_NOT_FOUND = {
  code: -32601,
  message: 'Method not found',
};

// TODO: This error code needs standardization:
const USER_REJECTED_ERROR = {
  code: 5,
  message: 'User rejected the request.',
};

function createJsonRpcCapabilities ({ safeMethods = [], restrictedMethods = {}, initState = {}, methods = {}, methodPrefix = '', requestUserApproval}) {

  const that = {};

  that.safeMethods = safeMethods;
  that.restrictedMethods = restrictedMethods;
  that.methods = methods;
  that.requestUserApproval = requestUserApproval;

  that.store = new ObservableStore(initState || {});
  that.memStore = new ObservableStore({
    permissionsRequests: [],
  });

  that.serialize = function () {
    return that.store.getState();
  };

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
  that.providerMiddlewareFunction = function (domain, req, res, next, end) {
    const methodName = req.method;

    // skip registered safe/passthrough methods.
    if (that.safeMethods.includes(methodName)) {
      return next();
    }

    // handle internal methods before any restricted methods.
    if (methodName in that.internalMethods) {
      return that.internalMethods[methodName](domain, req, res, next, end);
    }

    // Traverse any permission delegations
    let permission;
    try {
      permission = that.getPermission(domain, methodName);
    } catch (err) {
      res.error = {
        message: err.message,
        code: 1,
      };
      return end(res.error);
    }

    if (!permission) {
      res.error = UNAUTHORIZED_ERROR;
      return end(UNAUTHORIZED_ERROR);
    }

    that.executeMethod(domain, req, res, next, end);
  };

  that.executeMethod = function (domain, req, res, next, end) {
    const methodName = req.method;
    const permission = that.getPermission(domain, methodName);
    if (methodName in that.restrictedMethods
       && typeof that.restrictedMethods[methodName].method === 'function') {
      const restrictedMethod = that.restrictedMethods[methodName];

      // Support static caveat:
      if (permission.caveats) {
        const statics = permission.caveats.filter(c => c.type === 'static');

        if (statics.length > 0) {
          res.result = statics[statics.length - 1].value;
          return end();
        }
      }

      return that.restrictedMethods[methodName].method(req, res, next, end);
    }

    res.error = METHOD_NOT_FOUND;
    return end(METHOD_NOT_FOUND);
  };

  that.getPermissions = function (domain) {
    const { domains = {} } = that.store.getState();
    if (domain in domains) {
      const { permissions } = domains[domain];
      return permissions;
    }
    return {};
  };

  /*
   * Get the parent-most permission granting the requested domain's method permission.
   */
  that.getPermission = function (domain, method) {
    // TODO: Aggregate & Enforce Caveats at each step.
    // https://w3c-ccg.github.io/ocap-ld/#caveats

    let permissions = that.getPermissions(domain);

    while (permissions && method in permissions) {
      if ('grantedBy' in permissions[method]) {
        permissions = that.getPermissions(permissions[method].grantedBy);
      } else {
        return permissions[method];
      }
    }

    return undefined;
  };

  /*
   * Get the permission for that domain and method, not following grantedBy links.
   */
  that.getPermissionUnTraversed = function (domain, method) {
    // TODO: Aggregate & Enforce Caveats at each step.
    // https://w3c-ccg.github.io/ocap-ld/#caveats

    let permissions = that.getPermissions(domain);
    if (permissions && method in permissions) {
      return permissions[method];
    }

    return undefined;
  };


  that.getPermissions = function () {
    const perms = that.memStore.getState().permissions;
    return perms || {};
  };

  that.getPermissionsRequests = function () {
    const reqs = that.memStore.getState().permissionsRequests;
    return reqs || {};
  };

  that.setPermissionsRequests = function (permissionsRequests) {
    that.memStore.updateState({ permissionsRequests });
  };

  /*
   * Used for granting a new set of permissions,
   * after the user has approved it.
   *
   * @param {object} permissions - An object describing the granted permissions.
   */
  that.grantNewPermissions = function (domain, permissions, res, end) {
    // Remove any matching requests from the queue:
    that.permissionsRequests = that.getPermissionsRequests.filter((request) => {
      const sameDomain = request.domain === domain;
      const samePerms = equal(Object.keys(request.options), Object.keys(permissions));
      return !(sameDomain && samePerms);
    });

    // Update the related permission objects:
    that.setPermissionsFor(domain, permissions);
    res.result = that.getPermissions(domain);
    end();
  };

  that.getDomains = function () {
    const { domains } = that.store.getState();
    return domains || {};
  };

  that.setDomains = function (domains) {
    that.store.updateState({ domains });
  };

  that.getDomainSettings = function (domain) {
    const domains = that.getDomains;

    // Setup if not yet existent:
    if (!(domain in domains)) {
      domains[domain] = { permissions: {} };
    }

    return domains[domain];
  };

  that.setDomain = function (domain, domainSettings) {
    const domains = that.getDomains;
    domains[domain] = domainSettings;
    const state = that.store.getState();
    state.domains = domains;
    that.store.putState(state);
  };

  that.setPermissionsFor = function (domainName, newPermissions) {
    const domain = that.getDomainSettings(domainName);

    const { permissions } = domain;

    for (let key in newPermissions) {
      permissions[key] = newPermissions[key];
    }

    domain.permissions = permissions;
    that.setDomain(domainName, domain);
  };

  that.removePermissionsFor = function (domainName , permissionsToRemove) {
    const domain = that.getDomainSettings(domainName);

    const { permissions } = domain;

    permissionsToRemove.forEach((key) => {
      delete permissions[key];
    });

    domain.permissions = permissions;
    that.setDomain(domainName, domain);
  };

  that.getPermissionsMiddleware = function (domain, req, res, next, end) {
    const permissions = that.getPermissions(domain);
    res.result = permissions;
    end();
  };

  /*
   * The capabilities middleware function used for requesting additional permissions from the user.
   *
   * @param {object} req - The JSON RPC formatted request object.
   * @param {Array} req.params - The JSON RPC formatted params array.
   * @param {object} req.params[0] - An object of the requested permissions.
   */
  that.requestPermissionsMiddleware = function (domain, req, res, next, end) {

    // TODO: Validate permissions request
    const options = req.params[0];
    const requests = that.getPermissionsRequests;
    requests.push({
      domain,
      options,
    });
    that.setPermissionsRequests(requests);

    if (!that.requestUserApproval) {
      res.result = 'Request submitted, no user approval callback provided.';
      return end();
    }

    that.requestUserApproval(domain, options)
    // TODO: Allow user to pass back an object describing
    // the approved permissions, allowing user-customization.
    .then((approved) => {

      if (!approved) {
        res.error = USER_REJECTED_ERROR;
        return end(USER_REJECTED_ERROR);
      }

      // If user approval is boolean, the request is wholly approved
      if (typeof approved === 'boolean') {
        return that.grantNewPermissions(domain, options, res, end);
      }

      // If user approval is different, use it as the permissions:
      that.grantNewPermissions(domain, approved, res, end);
    })
    .catch((reason) => {
      res.error = reason;
      return end(reason);
    });
  };

  that.grantPermissionsMiddleware = function (domain, req, res, next, end) {
    // TODO: Validate params
    const [ assignedDomain, requestedPerms ] = req.params;
    const perms = that.getPermissions(domain);
    const assigned = that.getPermissions(assignedDomain);
    const newlyGranted = {};
    for (const methodName in requestedPerms) {
      const perm = that.getPermission(domain, methodName);
      if (perm) {
        const newPerm = {
          date: Date.now(),
          grantedBy: domain,
        };
        assigned[methodName] = newPerm;
        newlyGranted[methodName] = newPerm;
      } else {
        res.error = UNAUTHORIZED_ERROR;
        return end(UNAUTHORIZED_ERROR);
      }
    }

    that.setPermissionsFor(assignedDomain, assigned);
    res.result = newlyGranted;
    end();
  };

  that.revokePermissionsMiddleware = function (domain, req, res, next, end) {
    // TODO: Validate params
    const [ assignedDomain, requestedPerms ] = req.params;
    const perms = that.getPermissions(domain);
    const assigned = that.getPermissions(assignedDomain);
    const newlyRevoked = [];
    for (const methodName in requestedPerms) {
      const perm = that.getPermissionUnTraversed(assignedDomain, methodName);
      if (perm &&
          // Grantors can revoke what they have granted:
         ((perm.grantedBy && perm.grantedBy === domain)
          // Domains can revoke their own permissions:
          || (assignedDomain === domain))) {

        newlyRevoked.push(methodName);
      } else {
        res.error = UNAUTHORIZED_ERROR;
        return end(UNAUTHORIZED_ERROR);
      }
    }

    that.removePermissionsFor(assignedDomain, newlyRevoked);
    res.result = newlyRevoked;
    end();
  };

  that.internalMethods = {};
  that.internalMethods[`${methodPrefix}getPermissions`] = that.getPermissionsMiddleware.bind(that);
  that.internalMethods[`${methodPrefix}requestPermissions`] = that.requestPermissionsMiddleware.bind(that);
  that.internalMethods[`${methodPrefix}grantPermissions`] = that.grantPermissionsMiddleware.bind(that);
  that.internalMethods[`${methodPrefix}revokePermissions`] = that.revokePermissionsMiddleware.bind(that);
  // TODO: Freeze internal methods object.

  return that;
}

module.exports = function (opts) {
  return createJsonRpcCapabilities(opts);
};

