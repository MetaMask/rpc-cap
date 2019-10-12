/// <reference path="../index.ts" />

const test = require('tape');
const CapabilitiesController = require('../dist').CapabilitiesController
const sendRpcMethodWithResponse = require('./lib/utils').sendRpcMethodWithResponse;

const UNAUTHORIZED_CODE = require('eth-json-rpc-errors').ERROR_CODES.provider.unauthorized

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

    await sendRpcMethodWithResponse(ctrl, domain, req);

    // Now let's call that restricted method:
    req = {
      method: 'write',
      params: [
        'notAllowed',
        { definitely: 'restricted' },
      ]
    }

    await sendRpcMethodWithResponse(ctrl, domain, req);
    t.notOk(true, 'should have thrown')

  } catch (err) {
    t.ok(err, 'should throw');
    t.equal(err.code, UNAUTHORIZED_CODE, 'Auth error code.');
  }
  t.end();
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

  } catch (err) {
    t.notOk(err, 'should not throw');
  }
  t.end();
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

    await sendRpcMethodWithResponse(ctrl, domain, req);

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

  } catch (err) {
    t.notOk(err, 'should not throw');
  }
  t.end();
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

  } catch (err) {
    t.notOk(err, 'should not throw');
  }
  t.end();
})

test('forceParams caveat overwrites', async (t) => {
  const domain = { origin: 'www.metamask.io' };

  const ctrl = new CapabilitiesController({
    restrictedMethods: {
      'testMethod': {
        method: (req, res, next, end) => {
          res.result = req.params;
          end();
        }
      }
    },

    // User approves on condition of first arg being 'foo',
    // and second arg having the 'bar': 'baz' value.
    requestUserApproval: async (permissionsRequest) => {
      return permissionsRequest.permissions;
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
          'testMethod': {
            caveats: [
              { type: 'forceParams', value: [0,1,2,3] },
            ]
          },
        }
      ]
    };

    await sendRpcMethodWithResponse(ctrl, domain, req);

    // Now let's call that restricted method:
    req = {
      method: 'testMethod',
      params: [],
    }

    const result = await sendRpcMethodWithResponse(ctrl, domain, req);

    t.ok(result, 'should succeed');
    t.deepEqual(result, [0,1,2,3], 'Returned the correct subset');

  } catch (err) {
    t.notOk(err, 'should not throw');
  }
  t.end();
})

test('semantic caveats', async (t) => {
  const domain = { origin: 'www.metamask.io' };

  const ctrl = new CapabilitiesController({
    restrictedMethods: {
      'testMethod': {
        method: (req, res, _next, end) => {
          res.result = req.params;
          end();
        }
      }
    },

    semanticCaveatTypes: {
      'a': {},
      'b': {},
    },

    // All permissions automatically approved
    requestUserApproval: async (permissionsRequest) => {
      return permissionsRequest.permissions;
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
          'testMethod': {
            caveats: [
              {
                type: 'forceParams',
                value: [0,1,2,3],
                semanticType: 'a'
              },
            ]
          },
        }
      ]
    }

    await sendRpcMethodWithResponse(ctrl, domain, req);

    test('can add caveats of different semantic types', async (t) => {
      try {
        let req = {
          method: 'requestPermissions',
          params: [
            {
              'testMethod': {
                caveats: [
                  {
                    type: 'forceParams',
                    value: [0,1,2,3],
                    semanticType: 'a'
                  },
                  {
                    type: 'forceParams',
                    value: [0,1,2,3],
                    semanticType: 'b'
                  },
                ]
              },
            }
          ]
        }

        let res = await sendRpcMethodWithResponse(ctrl, domain, req);
        t.ok(res, 'received response');

      } catch (err) {
        t.notOk(err, 'should not throw');
      }
      t.end();
    })

    test('fails when adding multiple caveats of the same semantic type', async (t) => {
      try {
        let req = {
          method: 'requestPermissions',
          params: [
            {
              'testMethod': {
                caveats: [
                  {
                    type: 'forceParams',
                    value: [0,1,2,3],
                    semanticType: 'a'
                  },
                  {
                    type: 'forceParams',
                    value: [0,1,2,3],
                    semanticType: 'a'
                  },
                ]
              },
            }
          ]
        }

        await sendRpcMethodWithResponse(ctrl, domain, req);
        t.notOk(true, 'should have thrown')

      } catch (err) {
        t.ok(err.message.indexOf('Invalid semantic caveats.') !== -1, 'throws expected error');
      }
      t.end();
    });
  } catch (err) {
    t.notOk(err, 'should not throw');
  }
  t.end();
})

test('updateCaveatFor', async (t) => {

  const domain = { origin: 'www.metamask.io' };

  const cav1 = {
    type: 'forceParams',
    value: [0,1,2,3],
    semanticType: 'a'
  }

  const cav2 = {
    type: 'filterResponse',
    value: [0,1,2,3,4,5],
    semanticType: 'c'
  }


  const ctrl = new CapabilitiesController({
    restrictedMethods: {
      'testMethod': {
        method: (req, res, _next, end) => {
          res.result = req.params;
          end();
        }
      }
    },

    semanticCaveatTypes: {
      'a': {},
      'b': {},
      'c': {},
    },

    // All permissions automatically approved
    requestUserApproval: async (permissionsRequest) => {
      return permissionsRequest.permissions;
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
          'testMethod': {
            caveats: [
              { ...cav1 }, { ...cav2 }
            ]
          },
        }
      ]
    };

    await sendRpcMethodWithResponse(ctrl, domain, req);

    test('updateCaveatFor throws on non-existing domain', async (t) => {

      try {

        ctrl.updateCaveatFor(
          'foo.bar.xyz', 'testMethod', {
            type: 'forceParams',
            value: [0,1],
            semanticType: 'a'
          }
        )

        t.notOk(true, 'should have thrown')

      } catch (err) {
        t.ok(err, 'did throw')
      }
      t.end()
    })

    test('updateCaveatFor throws on non-existing method', async (t) => {

      try {

        ctrl.updateCaveatFor(
          domain.origin, 'doesNotExist', {
            type: 'forceParams',
            value: [0,1],
            semanticType: 'a'
          }
        )

        t.notOk(true, 'should have thrown')

      } catch (err) {
        t.ok(err, 'did throw')
      }
      t.end()
    })

    test('updateCaveatFor does not alter state after throwing', async (t) => {

      try {

        req = {
          method: 'testMethod',
          params: [],
        }
        const result = await sendRpcMethodWithResponse(ctrl, domain, req);

        t.ok(result, 'should succeed');
        t.deepEqual(result, [0,1,2,3], 'Returned the correct subset');

      } catch (err) {
        t.notOk(err, 'should not throw')
      }
      t.end()
    })

    test('updateCaveatFor successfully updates caveats', async (t) => {

      try {

        cav1.value = [0,1,2]

        ctrl.updateCaveatFor(
          domain.origin, 'testMethod', {
            type: 'forceParams',
            value: cav1.value,
            semanticType: 'a'
          }
        )

        req = {
          method: 'testMethod',
          params: [],
        }
        const result = await sendRpcMethodWithResponse(ctrl, domain, req);

        t.ok(result, 'should succeed');
        t.deepEqual(result, [0,1,2], 'returned the correct subset');

      } catch (err) {
        t.notOk(err, 'should not throw')
      }
      t.end()
    })

    test('updateCaveatFor throws on non-existing caveat with valid semantic type', async (t) => {

      try {

        ctrl.updateCaveatFor(
          domain.origin, 'testMethod', {
            type: 'forceParams',
            value: [0,1],
            semanticType: 'b'
          }
        )

        t.notOk(true, 'should have thrown')

      } catch (err) {
        t.ok(err, 'did throw')
      }
      t.end()
    })


    test('updateCaveatFor throws on non-existing semantic type', async (t) => {

      try {

        ctrl.updateCaveatFor(
          domain.origin, 'testMethod', {
            type: 'forceParams',
            value: [0,1],
            semanticType: 'doesNotExist'
          }
        )

        t.notOk(true, 'should have thrown')

      } catch (err) {
        t.ok(err, 'did throw')
      }
      t.end()
    })

    test('updateCaveatFor has no side effects', async (t) => {

      try {

        req = {
          method: 'testMethod',
          params: [],
        }
        const result = await sendRpcMethodWithResponse(ctrl, domain, req);

        t.ok(result, 'should succeed');
        t.deepEqual(result, [0,1,2], 'Returned the correct subset');

        const perms = ctrl.getPermissionsForDomain(domain.origin)
        t.ok(perms.length === 1, 'expected number of permissions remain')
        const { caveats } = perms[0]
        t.ok(caveats.length === 2, 'expected number of caveats remain')
        const c1 = caveats.find(p => p.semanticType === 'a') 
        t.deepEqual(c1, cav1, 'caveat 1 as expected')
        const c2 = caveats.find(p => p.semanticType === 'c')
        t.deepEqual(c2, cav2, 'caveat 2 as expected')

      } catch (err) {
        t.notOk(err, 'should not throw')
      }
      t.end()
    })

  } catch (err) {
    t.notOk(err, 'should not throw');
  }
  t.end();
})

test('updateCaveatFor - non-semantic controller', async (t) => {

  const domain = { origin: 'www.metamask.io' };

  const ctrl = new CapabilitiesController({
    restrictedMethods: {
      'testMethod': {
        method: (req, res, _next, end) => {
          res.result = req.params;
          end();
        }
      }
    },

    // All permissions automatically approved
    requestUserApproval: async (permissionsRequest) => {
      return permissionsRequest.permissions;
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
          'testMethod': {
            caveats: [
              { type: 'forceParams', value: [0,1,2,3] },
            ]
          },
        }
      ]
    };

    await sendRpcMethodWithResponse(ctrl, domain, req);
    ctrl.updateCaveatFor() // args should not matter

    t.notOk(true, 'should have thrown')
  } catch (err) {
    t.ok(err, 'should throw');
    t.ok(err.message.indexOf('configured for semantic') !== -1, 'throws expected error');
  }
  t.end();
})
