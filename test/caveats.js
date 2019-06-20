/// <reference path="../index.ts" />

const test = require('tape');
const CapabilitiesController = require('../dist').CapabilitiesController

test('filterParams caveat throws if params are not a subset.', async (t) => {
  const domain = { origin: 'www.metamask.io' };

  const ctrl = new CapabilitiesController({
    restrictedMethods: {
      'write': {
        method: (req, res, next, end) => {
          const params = req.params;
          res.result = params;
          end();
        }
      }
    },

    // User approves on condition of first arg being 'foo',
    // and second arg having the 'bar': 'baz' value.
    requestUserApproval: async (permissionsRequest) => {
      const perms = permissionsRequest.permissions;
      perms.write.caveats = [
        { type: 'filterParams', value: ['foo', { bar: 'baz' }] },
      ]
      return perms;
    },
  },
  {
    domains: {}
  })

  try {
    let req = {
      method: 'requestPermissions',
      params: [
        {
          'write': {},
        }
      ]
    };

    let res = await sendRpcMethodWithResponse(ctrl, domain, req);

    // Now let's call that restricted method:
    req = {
      method: 'write',
      params: [
        'notAllowed',
        { definitely: 'restricted' },
      ]
    }

    const result = await sendRpcMethodWithResponse(ctrl, domain, req);

  } catch (err) {
    t.ok(err, 'should throw');
    t.equal(err.code, 1, 'Auth error code.');
    t.end();
  }
})

test('filterParams caveat passes through if params are a subset.', async (t) => {
  const domain = { origin: 'www.metamask.io' };

  const ctrl = new CapabilitiesController({
    restrictedMethods: {
      'write': {
        method: (req, res, next, end) => {
          const params = req.params;
          res.result = params;
          end();
        }
      }
    },

    // User approves on condition of first arg being 'foo',
    // and second arg having the 'bar': 'baz' value.
    requestUserApproval: async (permissionsRequest) => {
      const perms = permissionsRequest.permissions;
      perms.write.caveats = [
        { type: 'filterParams', value: ['foo', { bar: 'baz' }] },
      ]
      return perms;
    },
  },
  {
    domains: {}
  })

  try {
    let req = {
      method: 'requestPermissions',
      params: [
        {
          'write': {},
        }
      ]
    };

    let res = await sendRpcMethodWithResponse(ctrl, domain, req);

    // Now let's call that restricted method:
    req = {
      method: 'write',
      params: [
        'foo',
        { bar: 'baz', also: 'bonusParams!' },
      ]
    }

    const result = await sendRpcMethodWithResponse(ctrl, domain, req);

    t.ok(result, 'should succeed');
    t.equal(req, result, 'Just returned the request');
    t.end();

  } catch (err) {
    t.notOk(err, 'should not throw');
    t.end();
  }
})

test('filterResponse caveat returns empty if params are not a subset.', async (t) => {
  const domain = { origin: 'www.metamask.io' };

  const ctrl = new CapabilitiesController({
    restrictedMethods: {
      'write': {
        method: (req, res, next, end) => {
          res.result = [1,2,3,4,5];
          end();
        }
      }
    },

    requestUserApproval: async (permissionsRequest) => {
      const perms = permissionsRequest.permissions;
      perms.write.caveats = [
        { type: 'filterResponse', value: [5, 6, 7, 8] },
      ]
      return perms;
    },
  },
  {
    domains: {}
  })

  try {
    let req = {
      method: 'requestPermissions',
      params: [
        {
          'write': {},
        }
      ]
    };

    let res = await sendRpcMethodWithResponse(ctrl, domain, req);

    // Now let's call that restricted method:
    req = {
      method: 'write',
      params: [
        'notAllowed',
        { definitely: 'restricted' },
      ]
    }

    const result = await sendRpcMethodWithResponse(ctrl, domain, req);
    t.equal(result[0], 5, 'returns the single intersecting item');
    t.end();

  } catch (err) {
    t.notOk(err, 'should not throw');
    t.end();
  }
})

test('filterResponse caveat passes through subset portion of response', async (t) => {
  const domain = { origin: 'www.metamask.io' };

  const ctrl = new CapabilitiesController({
    restrictedMethods: {
      'write': {
        method: (req, res, next, end) => {
          res.result = [1,2,3,4,5];
          end();
        }
      }
    },

    // User approves on condition of first arg being 'foo',
    // and second arg having the 'bar': 'baz' value.
    requestUserApproval: async (permissionsRequest) => {
      const perms = permissionsRequest.permissions;
      perms.write.caveats = [
        { type: 'filterResponse', value: [0,1,2,3]},
      ]
      return perms;
    },
  },
  {
    domains: {}
  })

  try {
    let req = {
      method: 'requestPermissions',
      params: [
        {
          'write': {},
        }
      ]
    };

    let res = await sendRpcMethodWithResponse(ctrl, domain, req);

    // Now let's call that restricted method:
    req = {
      method: 'write',
      params: [],
    }

    const result = await sendRpcMethodWithResponse(ctrl, domain, req);

    t.ok(result, 'should succeed');
    t.equal(result, [1,2,3], 'Returned the correct subset');
    t.end();

  } catch (err) {
    t.notOk(err, 'should not throw');
    t.end();
  }
})

async function sendRpcMethodWithResponse(ctrl, domain, req) {
  let res = {}
  return new Promise((resolve, reject) => {
    ctrl.providerMiddlewareFunction(domain, req, res, next, end)

    function next() {
      reject()
    }

    function end(reason) {
      if (reason) {
        reject(reason)
      }
      if (res.error) {
        reject(res.error)
      }

      resolve(res)
    }
  })
}
