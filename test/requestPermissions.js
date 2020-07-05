const test = require('tape');
const CapabilitiesController = require('../dist').CapabilitiesController;
const equal = require('fast-deep-equal');
const rpcErrors = require('eth-json-rpc-errors');

const USER_REJECTION_CODE = rpcErrors.ERROR_CODES.provider.userRejectedRequest;
const INVALID_REQUEST_CODE = rpcErrors.ERROR_CODES.rpc.invalidRequest;

test('requestPermissions with user rejection creates no permissions', async (t) => {
  const expected = [];

  const ctrl = new CapabilitiesController({
    requestUserApproval: () => Promise.resolve({}),
    restrictedMethods: {
      restricted: (_req, res, _next, end) => {
        res.result = 'Wahoo!';
        end();
      },
    },
  });

  const domain = { origin: 'login.metamask.io' };
  const req = {
    method: 'requestPermissions',
    params: [
      { restricted: {} },
    ],
  };
  const res = {};

  ctrl.providerMiddlewareFunction(domain, req, res, next, end);

  function next () {
    t.ok(false, 'next should not be called');
    t.end();
  }

  function end (reason) {
    t.ok(reason, 'error thrown');
    t.equal(reason.code, USER_REJECTION_CODE, 'Rejection error returned');
    t.ok(equal(ctrl.getPermissionsForDomain(domain.origin), expected), 'should have no permissions still');
    t.end();
  }
});

test('requestPermissions with invalid requested permissions object fails', async (t) => {
  const expected = [];

  const ctrl = new CapabilitiesController({
    requestUserApproval: () => Promise.resolve({}),
    restrictedMethods: {
      restricted: (_req, res, _next, end) => {
        res.result = 'Wahoo!';
        end();
      },
    },
  });

  const domain = { origin: 'login.metamask.io' };
  const req = {
    method: 'requestPermissions',
    params: [
      { restricted: { parentCapability: 'foo' } },
    ],
  };
  const res = {};

  ctrl.providerMiddlewareFunction(domain, req, res, next, end);

  function next () {
    t.ok(false, 'next should not be called');
    t.end();
  }

  function end (reason) {
    t.ok(reason, 'error thrown');
    t.equal(reason.code, INVALID_REQUEST_CODE, 'Invalid request error returned');
    t.ok(equal(ctrl.getPermissionsForDomain(domain.origin), expected), 'should have no permissions still');
    t.end();
  }
});

test('requestPermissions with user approval creates permission', async (t) => {

  const expected = {
    domains: {
      'login.metamask.io': {
        permissions: [{
          restricted: {},
        }],
      },
    },
  };

  const ctrl = new CapabilitiesController({
    requestUserApproval: () => Promise.resolve(expected.domains['login.metamask.io'].permissions[0]),
    restrictedMethods: {

      restricted: (_req, res, _next, end) => {
        res.result = 'Wahoo!';
        end();
      },
    },
  });

  const domain = { origin: 'login.metamask.io' };
  const req = {
    method: 'requestPermissions',
    params: [
      {
        restricted: {},
      },
    ],
  };

  try {
    await sendRpcMethodWithResponse(ctrl, domain, req);
    const endState = ctrl.state;
    const perms = endState.domains[domain.origin].permissions;
    t.equal(perms[0].parentCapability, 'restricted', 'permission added.');
    t.end();

  } catch (error) {
    t.error(error, 'error should not be thrown');
    t.end();
  }
});

test('approving unknown permission should fail', async (t) => {

  const ctrl = new CapabilitiesController({
    requestUserApproval: () => Promise.resolve({ unknownPerm: {} }),
    restrictedMethods: {
      restricted: (_req, res, _next, end) => {
        res.result = 'Wahoo!';
        end();
      },
    },
  });

  const domain = { origin: 'login.metamask.io' };
  const req = {
    method: 'requestPermissions',
    params: [
      {
        restricted: {},
      },
    ],
  };

  try {
    const res = await sendRpcMethodWithResponse(ctrl, domain, req);
    t.notOk(res, 'should not resolve');
    t.end();

  } catch (error) {
    t.ok(error, 'error should be thrown');
    t.equal(error.code, -32601, 'should throw method not found error');
    t.end();
  }
});

test('uses req.id as metadata.id of pending permissions request object', async (t) => {

  const domain = { origin: 'login.metamask.io' };
  const getReq = (id) => {
    return {
      id,
      method: 'requestPermissions',
      params: [
        { restricted: {} },
      ],
    };
  };
  const res = {};

  // valid ids with different types and boolean values
  const requestIds = ['1', 'abc', 1, 0, -1];
  let index = 0;

  const ctrl = new CapabilitiesController({
    requestUserApproval: (permissionsRequest) => {
      t.equal(
        permissionsRequest.metadata.id, requestIds[index],
        'permissions request object should have expected metadata.id'
      );
      if (index === requestIds.length - 1) {
        t.end();
      } else {
        index = index + 1;
      }
      return Promise.resolve({});
    },
    restrictedMethods: {
      restricted: (_req, res, _next, end) => {
        res.result = 'Wahoo!';
        end();
      },
    },
  });

  for (const id of requestIds) {
    ctrl.providerMiddlewareFunction(domain, getReq(id), res, next, () => {});
  }

  function next () {
    t.fail('next should not be called');
    t.end();
  }
});

async function sendRpcMethodWithResponse (ctrl, domain, req) {
  const res = {};
  return new Promise((resolve, reject) => {
    ctrl.providerMiddlewareFunction(domain, req, res, next, end);

    function next () {
      reject();
    }

    function end (reason) {
      if (reason) {
        reject(reason);
      }
      if (res.error) {
        reject(res.error);
      }

      resolve(res);
    }
  });
}
