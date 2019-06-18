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
      const perms = permissionsRequest.options;
      perms.write.caveats = [
        { type: 'filterParams', value: ['foo', { bar: 'baz' }] },
      ]
      console.log('user requested to approve', perms)
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
      const perms = permissionsRequest.options;
      perms.write.caveats = [
        { type: 'filterParams', value: ['foo', { bar: 'baz' }] },
      ]
      console.log('user requested to approve', perms)
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
    console.log(err);
    t.notOk(err, 'should not throw');
    t.end();
  }
})



/*
test('requesting restricted method with permission is called', async (t) => {
  const WRITE_RESULT = 'impeccable result'
  const domain = 'login.metamask.io'

  const ctrl = new CapabilitiesController({

    // safe methods never require approval,
    // are considered trivial / no risk.
    // maybe reading should be a permission, though!
    safeMethods: ['eth_read'],

    // optional prefix for internal methods
    methodPrefix: 'wallet_',
    restrictedMethods: {
      'eth_write': {
        method: (req, res, next, end) => {
          res.result = WRITE_RESULT
          return end()
        }
      }
    },
    requestUserApproval: noop,
  },
  {
    domains: {
      'login.metamask.io': {
        permissions: [
          {
            method: 'eth_write',
            date: '0',
          }
        ]
      }
    }
  })

  let req = { method: 'eth_write' }
  let res = {}
  ctrl.providerMiddlewareFunction(domain, req, res, next, end)

  function next() {
    t.ok(false, 'next should not be called')
    t.end()
  }

  function end(reason) {
    t.error(reason, 'should not throw error')
    t.error(res.error, 'should not have error object')
    t.equal(res.result, WRITE_RESULT, 'Write result should be assigned.')
    t.end()
  }
})

*/

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

