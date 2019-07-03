/// <reference path="../index.ts" />

const test = require('tape');
const CapabilitiesController = require('../dist').CapabilitiesController
const sendRpcMethodWithResponse = require('./lib/utils').sendRpcMethodWithResponse;

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
  const params = [
    'foo',
    { bar: 'baz', also: 'bonusParams!' },
  ]

  const ctrl = new CapabilitiesController({
    restrictedMethods: {
      'write': {
        method: (req, res, next, end) => {
          res.result = 'Success';
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
      params,
    }

    const result = await sendRpcMethodWithResponse(ctrl, domain, req);

    t.ok(result, 'should succeed');
    t.equal(result, 'Success', 'Just returned the request');
    t.end();

  } catch (err) {
    t.notOk(err, 'should not throw');
    t.end();
  }
})

test('filterResponse caveat returns empty if params are not a subset.', async (t) => {
  const domain = { origin: 'www.metamask.io' };
  const items = [
    '0x44ed36e289cd9e8de4d822ad373ae42aac890a68',
    '0x404d0886ad4933630160c169fffa1084d15b7beb',
    '0x30476e1d96ae0ebaae94558afa146b0023df2d07',
  ]

  const ctrl = new CapabilitiesController({
    restrictedMethods: {
      'readAccounts': {
        method: (req, res, next, end) => {
          res.result = items;
          end();
        }
      }
    },

    requestUserApproval: async (permissionsRequest) => {
      const perms = permissionsRequest.permissions;
      perms.readAccounts.caveats = [
        { type: 'filterResponse', value: [items[1], '123'] },
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
          'readAccounts': {},
        }
      ]
    };

    let res = await sendRpcMethodWithResponse(ctrl, domain, req);

    // Now let's call that restricted method:
    req = {
      method: 'readAccounts',
      params: [
        'notAllowed',
        { definitely: 'restricted' },
      ]
    }

    const result = await sendRpcMethodWithResponse(ctrl, domain, req);
    t.equal(result.length, 1, 'A single item');
    t.equal(result[0], items[1], 'returns the single intersecting item');
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
    t.deepEqual(result, [1,2,3], 'Returned the correct subset');
    t.end();

  } catch (err) {
    t.notOk(err, 'should not throw');
    t.end();
  }
})

test('requirePermissions caveat passes request through if required permissions present', async (t) => {

  const domain = { origin: 'www.metamask.io' };
  const ctrl = new CapabilitiesController({ restrictedMethods: {
      'read': {
        method: (req, res, next, end) => {
          res.result = 'read success';
          end();
        }
      },
      'write': {
        method: (req, res, next, end) => {
          res.result = 'write success';
          end();
        }
      }
    },

    // Request for 'write' only succeed if the request domain also has the
    // 'read' permission
    requestUserApproval: async (permissionsRequest) => {
      const perms = permissionsRequest.permissions;
      perms.write.caveats = [
        { type: 'requirePermissions', value: ['read']},
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
          'read': {},
          'write': {},
        }
      ]
    };

    await sendRpcMethodWithResponse(ctrl, domain, req);

    // Now let's call the restricted method:
    req = {
      method: 'write',
      params: [],
    }

    const result = await sendRpcMethodWithResponse(ctrl, domain, req);

    t.ok(result, 'should succeed');
    t.equal(result, 'write success', 'Returned the result');
    t.end();

  } catch (err) {
    t.notOk(err, 'should not throw');
    t.end();
  }
})

test('requirePermissions caveat terminates request if required permissions not present', async (t) => {

  const domain = { origin: 'www.metamask.io' };

  const ctrl = new CapabilitiesController({
    restrictedMethods: {
      'read': {
        method: (req, res, next, end) => {
          res.result = 'read success';
          end();
        }
      },
      'write': {
        method: (req, res, next, end) => {
          res.result = 'write success';
          end();
        }
      }
    },

    // Request for 'write' only succeed if the request domain also has the
    // 'read' permission
    requestUserApproval: async (permissionsRequest) => {
      const perms = permissionsRequest.permissions;
      perms.write.caveats = [
        { type: 'requirePermissions', value: ['read']},
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

    await sendRpcMethodWithResponse(ctrl, domain, req);

    // Now let's call the restricted method:
    req = {
      method: 'write',
      params: [],
    }

    await sendRpcMethodWithResponse(ctrl, domain, req);

    t.ok(false, 'did not throw');

  } catch (err) {
    t.ok(err, 'should throw');
    t.equal(err.code, 1, 'Auth error code.');
    t.end();
  }
})
