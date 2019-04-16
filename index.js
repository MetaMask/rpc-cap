const ObservableStore = require('obs-store');
const equal = require('fast-deep-equal');
const uuid = require('uuid/v4');


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

function createJsonRpcCapabilities ({
  safeMethods = [], restrictedMethods = {}, initState = {},
  methods = {}, methodPrefix = '', requestUserApproval
}) {

  const that = {};

  that.safeMethods = safeMethods;
  that.restrictedMethods = restrictedMethods;
  that.methods = methods;
  that.requestUserApproval = requestUserApproval;

  that.store = Reflect.construct(ObservableStore, [initState || {}]);
  that.memStore = Reflect.construct(ObservableStore, [{
    permissionsRequests: [],
    permissionsDescriptions: Object.keys(restrictedMethods).map((methodName) => {
      return {
        method: methodName,
        description: restrictedMethods[methodName].description,
      };
    }),
  }]);

  that.serialize = function () {
    return that.store.getState();
  };

  /**
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
    if (Object.keys(that.internalMethods).includes(methodName)) {
      return that.internalMethods[methodName](domain, req, res, next, end);
    }

    // Traverse any permission delegations
    let permission;
    try {
      permission = getPermission(domain, methodName);
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
    if (Object.keys(that.restrictedMethods).includes(methodName)
        && typeof that.restrictedMethods[methodName].method === 'function') {

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

  that.getPermissionsForDomain = function (domain) {
    const { domains = {} } = that.store.getState();
    if (Object.keys(domains).includes(domain)) {
      const { permissions } = domains[domain];
      return permissions;
    }
    return [];
  };

  /**
   * Get the parent-most permission granting the requested domain's method permission.
   * Follows the delegation chain of the first matching permission found.
   * 
   * TODO: Enable getPermission for domain and permission id, to extract parent
   * of specific permission.
   * 
   * @param {string} domain - The domain whose permission to retrieve.
   * @param {string} method - The method
   */
  function getPermission (domain, method) {
    // TODO: Aggregate & Enforce Caveats at each step.
    // https://w3c-ccg.github.io/ocap-ld/#caveats

    const methodFilter = p => p.method === method;

    let perm;
    let permissions = that.getPermissionsForDomain(domain).filter(
      p => p.method === method
      // p => p.id === id
    );

    while (permissions.length > 0) {
      perm = permissions.shift();
      if (perm.granter) {
        permissions = that.getPermissionsForDomain(perm.granter).filter(
          p => p.method === method
        );
      } else {
        return perm;
      }
    }

    return undefined;
  };
  that.getPermission = getPermission;

  /**
   * Get the permission for that domain, granter, and method, not following granter links.
   * Returns the first such permission found.
   */
  that.getPermissionUnTraversed = function (domain, method, granter = undefined) {
    // TODO: Aggregate & Enforce Caveats at each step.
    // https://w3c-ccg.github.io/ocap-ld/#caveats

    let permissions = that.getPermissionsForDomain(domain).filter(p => {
      return p.method === method && (
        (p.granter === undefined && granter === domain) || // own permission
        (p.granter !== undefined && p.granter === granter) // granted permission
      );
    });
    if (permissions.length > 0) { return permissions.shift(); }

    return undefined;
  };

  that.getPermissions = function () {
    const perms = that.memStore.getState().permissions;
    return perms || [];
  };

  that.getPermissionsRequests = function () {
    const reqs = that.memStore.getState().permissionsRequests;
    return reqs || [];
  };

  that.setPermissionsRequests = function (permissionsRequests) {
    that.memStore.updateState({ permissionsRequests });
  };

  /**
   * Used for granting a new set of permissions,
   * after the user has approved it.
   * 
   * @param {string} domain - The domain receiving new permissions.
   * @param {Array} permissions - An array of objects describing the granted permissions.
   * @param {Object} res - The response.
   * @param {function} end - The end function.
   */
  that.grantNewPermissions = function (domain, permissions, res, end) {
    // Remove any matching requests from the queue:
    that.setPermissionsRequests(that.getPermissionsRequests().filter((request) => {
      const sameDomain = request.origin === domain;
      let samePerms = false;
      for (let perm of permissions) {
        if (perm.method === request.options.method) {
          samePerms = true;
          break;
        }
      }
      return !(sameDomain && samePerms);
    }));

    // Update the related permission objects:
    that.addPermissionsFor(domain, permissions);
    res.result = that.getPermissionsForDomain(domain);
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
    const domains = that.getDomains();

    // Setup if not yet existent:
    if (!(Object.keys(domains).includes(domain))) {
      domains[domain] = { permissions: [] };
    }

    return domains[domain];
  };

  that.setDomain = function (domain, domainSettings) {
    const domains = that.getDomains();
    domains[domain] = domainSettings;
    const state = that.store.getState();
    state.domains = domains;
    that.store.putState(state);
  };

  /**
   * Adds permissions to the given domain. Overwrites existing identical
   * permissions (same domain, method, and granter). Other existing permissions
   * remain unaffected.
   * 
   * @param {string} domainName - The grantee domain.
   * @param {Array} newPermissions - The unique, new permissions for the grantee domain.
   */
  that.addPermissionsFor = function (domainName, newPermissions) {
    const domain = that.getDomainSettings(domainName);

    // remove old permissions that will be overwritten
    domain.permissions = domain.permissions.filter(oldPerm => {
      let isReplaced = false;
      for (newPerm of newPermissions) {
        if (
          oldPerm.method === newPerm.method &&
          oldPerm.granter === newPerm.granter
        ) {
          isReplaced = true;
          break;
        }
      }
      return !isReplaced;
    });

    // add new permissions
    // TODO: ensure newPermissions only contains unique permissions
    for (let perm of newPermissions) {
      if (!perm.id) {
        perm.id = uuid();
        perm.date = Date.now();
      }
      domain.permissions.push(perm);
    }
    that.setDomain(domainName, domain);
  };

  /**
   * Removes the specified permissions from the given domain.
   * 
   * @param {string} domainName - The domain name whose permissions to remove.
   * @param {Array} permissionsToRemove - Objects identifying the permissions to remove.
   */
  that.removePermissionsFor = function (domainName , permissionsToRemove) {
    const domain = that.getDomainSettings(domainName);

    domain.permissions = domain.permissions.reduce((acc, perm) => {
      let keep = true;
      for (let r of permissionsToRemove) {
        if (
          r.method === perm.method &&
          r.granter === perm.granter
        ) {
          keep = false;
          break;
        }
      }
      if (keep) { acc.push(perm); }
      return acc;
    }, []);

    that.setDomain(domainName, domain);
  };

  that.getPermissionsMiddleware = function (domain, req, res, next, end) {
    const permissions = that.getPermissionsForDomain(domain);
    res.result = permissions;
    end();
  };

  /**
   * The capabilities middleware function used for requesting additional permissions from the user.
   *
   * @param {Object} req - The JSON RPC formatted request object.
   * @param {Array} req.params - The JSON RPC formatted params array.
   * @param {Object} req.params[0] - An object of the requested permissions.
   */
  that.requestPermissionsMiddleware = function (domain, req, res, next, end) {
    const metadata = req.metadata || {
      origin: domain,
      siteTitle: domain,
    };

    if (!metadata.id) {
      metadata.id = uuid();
    }

    // TODO: Validate permissions request
    const permissions = req.params[0];
    const requests = that.getPermissionsRequests();
    for (let perm of permissions) {
      requests.push({
        origin: domain,
        metadata,
        options: perm,
      });
    }
    that.setPermissionsRequests(requests);

    if (!that.requestUserApproval) {
      res.result = 'Request submitted, no user approval callback provided.';
      return end();
    }

    that.requestUserApproval(metadata, permissions)
    // TODO: Allow user to pass back an object describing
    // the approved permissions, allowing user-customization.
    .then((approved) => {

      if (!approved) {
        res.error = USER_REJECTED_ERROR;
        return end(USER_REJECTED_ERROR);
      }

      // If user approval is boolean, the request is wholly approved
      if (typeof approved === 'boolean') {
        return that.grantNewPermissions(domain, permissions, res, end);
      }

      // If user approval is different, use it as the permissions:
      that.grantNewPermissions(domain, [approved], res, end);
    })
    .catch((reason) => {
      res.error = reason;
      return end(reason);
    });
  };

  that.grantPermissionsMiddleware = function (granter, req, res, next, end) {
    // TODO: Validate params
    // TODO: Allow objects in requestedPerms to specify permission id
    let [ grantee, requestedPerms ] = req.params;
    const newlyGranted = [];

    // remove duplicates from requestedPerms
    const methodNames = {};
    requestedPerms = requestedPerms.filter(p => {
      if (!methodNames[p.method]) {
        methodNames[p.method] = true;
        return true;
      }
      return false;
    });

    let ended = false;
    requestedPerms.forEach((reqPerm) => {
      const methodName = reqPerm.method;
      const perm = that.getPermission(granter, methodName);
      if (perm) {
        const newPerm = {
          date: Date.now(),
          granter: granter,
          id: uuid(),
          method: methodName,
        };
        if (perm.caveats) { newPerm.caveats = perm.caveats; }
        newlyGranted.push(newPerm);
      } else {
        res.error = UNAUTHORIZED_ERROR;
        ended = true;
        return end(UNAUTHORIZED_ERROR);
      }
    });

    if (ended) {
      return;
    }

    that.addPermissionsFor(grantee, newlyGranted);
    res.result = newlyGranted;
    end();
  };

  that.revokePermissionsMiddleware = function (domain, req, res, next, end) {
    // TODO: Validate params
    const [ assignedDomain, requestedPerms ] = req.params;
    const newlyRevoked = [];

    let ended = false;
    requestedPerms.forEach((reqPerm) => {
      const methodName = reqPerm.method;
      const perm = that.getPermissionUnTraversed(
        assignedDomain, methodName, domain
      );
      if (
            perm && (
              // Grantors can revoke what they have granted:
              (perm.granter && perm.granter === domain) ||
              // Domains can revoke their own permissions:
              (assignedDomain === domain)
            )
          ) {
        newlyRevoked.push(perm);
      } else {
        res.error = UNAUTHORIZED_ERROR;
        ended = true;
        return end(UNAUTHORIZED_ERROR);
      }
    });

    if (ended) {
      return;
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

module.exports = createJsonRpcCapabilities;

