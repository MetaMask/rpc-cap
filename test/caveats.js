// / <reference path="../index.ts" />

const test = require('tape');
const { CapabilitiesController } = require('../dist');
const { sendRpcMethodWithResponse } = require('./lib/utils');

const UNAUTHORIZED_CODE = require('eth-rpc-errors').errorCodes.provider.unauthorized;

test('requireParamsIsSubset caveat throws if params is not a subset of the caveat value.', async (t) => {
  const domain = { origin: 'www.metamask.io' };

  const ctrl = new CapabilitiesController({
    restrictedMethods: {
      'write': {
        method: (req, res, _next, end) => {
          const { params } = req;
          res.result = params;
          end();
        },
      },
    },

    // User approves on condition of first arg being 'foo',
    // and second arg having the 'bar': 'baz' value.
    requestUserApproval: async (permissionsRequest) => {
      const perms = permissionsRequest.permissions;
      perms.write.caveats = [
        { type: 'requireParamsIsSubset', value: ['foo', { bar: 'baz' }] },
      ];
      return perms;
    },
  },
  {
    domains: {},
  });

  try {
    let req = {
      method: 'requestPermissions',
      params: [
        {
          'write': {},
        },
      ],
    };

    await sendRpcMethodWithResponse(ctrl, domain, req);

    // Now let's call that restricted method:
    req = {
      method: 'write',
      params: [
        'foo',
        { bar: 'baz', definitely: 'restricted' },
      ],
    };

    await sendRpcMethodWithResponse(ctrl, domain, req);
    t.notOk(true, 'should have thrown');

  } catch (err) {
    t.ok(err, 'should throw');
    t.equal(err.code, UNAUTHORIZED_CODE, 'Auth error code.');
  }
  t.end();
});

test('requireParamsIsSubset caveat passes through if params is a subset of the caveat value.', async (t) => {
  const domain = { origin: 'www.metamask.io' };

  const ctrl = new CapabilitiesController({
    restrictedMethods: {
      'write': {
        method: (_req, res, _next, end) => {
          res.result = 'Success';
          end();
        },
      },
    },

    // User approves on condition of first arg being 'foo',
    // and second arg having the 'bar': 'baz' value.
    requestUserApproval: async (permissionsRequest) => {
      const perms = permissionsRequest.permissions;
      perms.write.caveats = [
        { type: 'requireParamsIsSubset', value: [{ bar: 'baz' }, 'foo'] },
      ];
      return perms;
    },
  },
  {
    domains: {},
  });

  try {
    let req = {
      method: 'requestPermissions',
      params: [
        {
          'write': {},
        },
      ],
    };

    await sendRpcMethodWithResponse(ctrl, domain, req);

    // Now let's call that restricted method:
    req = {
      method: 'write',
      params: [
        { bar: 'baz' },
      ],
    };

    const result = await sendRpcMethodWithResponse(ctrl, domain, req);

    t.ok(result, 'should succeed');
    t.equal(result, 'Success', 'Just returned the request');

  } catch (err) {
    t.notOk(err, 'should not throw');
  }
  t.end();
});

test('requireParamsIsSuperset caveat throws if params is not a superset of the caveat value.', async (t) => {
  const domain = { origin: 'www.metamask.io' };

  const ctrl = new CapabilitiesController({
    restrictedMethods: {
      'write': {
        method: (req, res, _next, end) => {
          const params = req.params;
          res.result = params;
          end();
        },
      },
    },

    // User approves on condition of first arg being 'foo',
    // and second arg having the 'bar': 'baz' value.
    requestUserApproval: async (permissionsRequest) => {
      const perms = permissionsRequest.permissions;
      perms.write.caveats = [
        { type: 'requireParamsIsSuperset', value: ['foo', { bar: 'baz' }] },
      ];
      return perms;
    },
  },
  {
    domains: {},
  });

  try {
    let req = {
      method: 'requestPermissions',
      params: [
        {
          'write': {},
        },
      ],
    };

    await sendRpcMethodWithResponse(ctrl, domain, req);

    // Now let's call that restricted method:
    req = {
      method: 'write',
      params: [
        'foo',
        { definitely: 'restricted' },
      ],
    };

    await sendRpcMethodWithResponse(ctrl, domain, req);
    t.notOk(true, 'should have thrown');

  } catch (err) {
    t.ok(err, 'should throw');
    t.equal(err.code, UNAUTHORIZED_CODE, 'Auth error code.');
  }
  t.end();
});

test('requireParamsIsSuperset caveat passes through if params is a superset of the caveat value.', async (t) => {
  const domain = { origin: 'www.metamask.io' };

  const ctrl = new CapabilitiesController({
    restrictedMethods: {
      'write': {
        method: (_req, res, _next, end) => {
          res.result = 'Success';
          end();
        },
      },
    },

    // User approves on condition of first arg being 'foo',
    // and second arg having the 'bar': 'baz' value.
    requestUserApproval: async (permissionsRequest) => {
      const perms = permissionsRequest.permissions;
      perms.write.caveats = [
        { type: 'requireParamsIsSuperset', value: ['foo', { bar: 'baz' }] },
      ];
      return perms;
    },
  },
  {
    domains: {},
  });

  try {
    let req = {
      method: 'requestPermissions',
      params: [
        {
          'write': {},
        },
      ],
    };

    await sendRpcMethodWithResponse(ctrl, domain, req);

    // Now let's call that restricted method:
    req = {
      method: 'write',
      params: [
        'foo',
        { bar: 'baz', also: 'bonusParams!' },
      ],
    };

    const result = await sendRpcMethodWithResponse(ctrl, domain, req);

    t.ok(result, 'should succeed');
    t.equal(result, 'Success', 'Just returned the request');

  } catch (err) {
    t.notOk(err, 'should not throw');
  }
  t.end();
});

test('filterResponse caveat returns empty if params are not a subset.', async (t) => {
  const domain = { origin: 'www.metamask.io' };
  const items = [
    '0x44ed36e289cd9e8de4d822ad373ae42aac890a68',
    '0x404d0886ad4933630160c169fffa1084d15b7beb',
    '0x30476e1d96ae0ebaae94558afa146b0023df2d07',
  ];

  const ctrl = new CapabilitiesController({
    restrictedMethods: {
      'readAccounts': {
        method: (_req, res, _next, end) => {
          res.result = items;
          end();
        },
      },
    },

    requestUserApproval: async (permissionsRequest) => {
      const perms = permissionsRequest.permissions;
      perms.readAccounts.caveats = [
        { type: 'filterResponse', value: [items[1], '123'] },
      ];
      return perms;
    },
  },
  {
    domains: {},
  });

  try {
    let req = {
      method: 'requestPermissions',
      params: [
        {
          'readAccounts': {},
        },
      ],
    };

    await sendRpcMethodWithResponse(ctrl, domain, req);

    // Now let's call that restricted method:
    req = {
      method: 'readAccounts',
      params: [
        'notAllowed',
        { definitely: 'restricted' },
      ],
    };

    const result = await sendRpcMethodWithResponse(ctrl, domain, req);
    t.equal(result.length, 1, 'A single item');
    t.equal(result[0], items[1], 'returns the single intersecting item');

  } catch (err) {
    t.notOk(err, 'should not throw');
  }
  t.end();
});

test('filterResponse caveat passes through subset portion of response when objects are used', async (t) => {
  const domain = { origin: 'www.metamask.io' };

  const ctrl = new CapabilitiesController({
    restrictedMethods: {
      'write': {
        method: (_req, res, _next, end) => {
          res.result = [{ foo: 'bar' }, { baz: 'boo' }, 3, 4, 5];
          end();
        },
      },
    },

    // User approves on condition of first arg being 'foo',
    // and second arg having the 'bar': 'baz' value.
    requestUserApproval: async (permissionsRequest) => {
      const perms = permissionsRequest.permissions;
      perms.write.caveats = [
        { type: 'filterResponse', value: [{ foo: 'bar' }, { baz: 'boo' }, 3] },
      ];
      return perms;
    },
  },
  {
    domains: {},
  });

  try {
    let req = {
      method: 'requestPermissions',
      params: [
        {
          'write': {},
        },
      ],
    };

    await sendRpcMethodWithResponse(ctrl, domain, req);

    // Now let's call that restricted method:
    req = {
      method: 'write',
      params: [],
    };

    const result = await sendRpcMethodWithResponse(ctrl, domain, req);

    t.ok(result, 'should succeed');
    t.deepEqual(result, [{ foo: 'bar' }, { baz: 'boo' }, 3], 'returned the correct subset');

  } catch (err) {
    t.notOk(err, 'should not throw');
  }
  t.end();
});

test('filterResponse caveat passes through subset portion of response', async (t) => {
  const domain = { origin: 'www.metamask.io' };

  const ctrl = new CapabilitiesController({
    restrictedMethods: {
      'write': {
        method: (_req, res, _next, end) => {
          res.result = [1, 2, 3, 4, 5];
          end();
        },
      },
    },

    // User approves on condition of first arg being 'foo',
    // and second arg having the 'bar': 'baz' value.
    requestUserApproval: async (permissionsRequest) => {
      const perms = permissionsRequest.permissions;
      perms.write.caveats = [
        { type: 'filterResponse', value: [0, 1, 2, 3] },
      ];
      return perms;
    },
  },
  {
    domains: {},
  });

  try {
    let req = {
      method: 'requestPermissions',
      params: [
        {
          'write': {},
        },
      ],
    };

    await sendRpcMethodWithResponse(ctrl, domain, req);

    // Now let's call that restricted method:
    req = {
      method: 'write',
      params: [],
    };

    const result = await sendRpcMethodWithResponse(ctrl, domain, req);

    t.ok(result, 'should succeed');
    t.deepEqual(result, [1, 2, 3], 'returned the correct subset');

  } catch (err) {
    t.notOk(err, 'should not throw');
  }
  t.end();
});

test('limitResponseLength caveat returns all results if less than value.', async (t) => {
  const domain = { origin: 'www.metamask.io' };
  const items = [
    '0x44ed36e289cd9e8de4d822ad373ae42aac890a68',
    '0x404d0886ad4933630160c169fffa1084d15b7beb',
    '0x30476e1d96ae0ebaae94558afa146b0023df2d07',
  ];

  const ctrl = new CapabilitiesController({
    restrictedMethods: {
      'readAccounts': {
        method: (_req, res, _next, end) => {
          res.result = items;
          end();
        },
      },
    },

    requestUserApproval: async (permissionsRequest) => {
      const perms = permissionsRequest.permissions;
      perms.readAccounts.caveats = [
        { type: 'limitResponseLength', value: 10 },
      ];
      return perms;
    },
  },
  {
    domains: {},
  });

  try {
    let req = {
      method: 'requestPermissions',
      params: [
        {
          'readAccounts': {},
        },
      ],
    };

    await sendRpcMethodWithResponse(ctrl, domain, req);

    // Now let's call that restricted method:
    req = {
      method: 'readAccounts',
      params: [
        'notAllowed',
        { definitely: 'restricted' },
      ],
    };

    const result = await sendRpcMethodWithResponse(ctrl, domain, req);
    t.equal(result.length, 3, 'All(3) items');
    t.equal(result[0], items[0], 'Returns in original order');

  } catch (err) {
    t.notOk(err, 'should not throw');
  }
  t.end();
});

test('limitResponseLength caveat returns only the specified number of values when original exceeds that number', async (t) => {
  const domain = { origin: 'www.metamask.io' };

  const ctrl = new CapabilitiesController({
    restrictedMethods: {
      'write': {
        method: (_req, res, _next, end) => {
          res.result = [1, 2, 3, 4, 5];
          end();
        },
      },
    },

    // User approves on condition of first arg being 'foo',
    // and second arg having the 'bar': 'baz' value.
    requestUserApproval: async (permissionsRequest) => {
      const perms = permissionsRequest.permissions;
      perms.write.caveats = [
        { type: 'limitResponseLength', value: 3 },
      ];
      return perms;
    },
  },
  {
    domains: {},
  });

  try {
    let req = {
      method: 'requestPermissions',
      params: [
        {
          'write': {},
        },
      ],
    };

    await sendRpcMethodWithResponse(ctrl, domain, req);

    // Now let's call that restricted method:
    req = {
      method: 'write',
      params: [],
    };

    const result = await sendRpcMethodWithResponse(ctrl, domain, req);

    t.ok(result, 'should succeed');
    t.deepEqual(result, [1, 2, 3], 'returned the correct subset');

  } catch (err) {
    t.notOk(err, 'should not throw');
  }
  t.end();
});

test('forceParams caveat overwrites', async (t) => {
  const domain = { origin: 'www.metamask.io' };

  const ctrl = new CapabilitiesController({
    restrictedMethods: {
      'testMethod': {
        method: (req, res, _next, end) => {
          res.result = req.params;
          end();
        },
      },
    },

    // User approves on condition of first arg being 'foo',
    // and second arg having the 'bar': 'baz' value.
    requestUserApproval: async (permissionsRequest) => {
      return permissionsRequest.permissions;
    },
  },
  {
    domains: {},
  });

  try {
    let req = {
      method: 'requestPermissions',
      params: [
        {
          'testMethod': {
            caveats: [
              { type: 'forceParams', value: [0, 1, 2, 3] },
            ],
          },
        },
      ],
    };

    await sendRpcMethodWithResponse(ctrl, domain, req);

    // Now let's call that restricted method:
    req = {
      method: 'testMethod',
      params: [],
    };

    const result = await sendRpcMethodWithResponse(ctrl, domain, req);

    t.ok(result, 'should succeed');
    t.deepEqual(result, [0, 1, 2, 3], 'returned the correct subset');

  } catch (err) {
    t.notOk(err, 'should not throw');
  }
  t.end();
});

test('named caveats', async (t) => {
  const domain = { origin: 'www.metamask.io' };

  const ctrl = new CapabilitiesController({
    restrictedMethods: {
      'testMethod': {
        method: (req, res, _next, end) => {
          res.result = req.params;
          end();
        },
      },
    },

    // All permissions automatically approved
    requestUserApproval: async (permissionsRequest) => {
      return permissionsRequest.permissions;
    },
  },
  {
    domains: {},
  });

  try {
    const req = {
      method: 'requestPermissions',
      params: [
        {
          'testMethod': {
            caveats: [
              {
                type: 'forceParams',
                value: [0, 1, 2, 3],
                name: 'a',
              },
            ],
          },
        },
      ],
    };

    await sendRpcMethodWithResponse(ctrl, domain, req);

    test('can add caveats with different names', async (t) => {
      try {
        const req = {
          method: 'requestPermissions',
          params: [
            {
              'testMethod': {
                caveats: [
                  {
                    type: 'forceParams',
                    value: [0, 1, 2, 3],
                    name: 'a',
                  },
                  {
                    type: 'forceParams',
                    value: [0, 1, 2, 3],
                    name: 'b',
                  },
                ],
              },
            },
          ],
        };

        const res = await sendRpcMethodWithResponse(ctrl, domain, req);
        t.ok(res, 'received response');

      } catch (err) {
        t.notOk(err, 'should not throw');
      }
      t.end();
    });

    test('fails when adding multiple caveats with the same name', async (t) => {
      try {
        const req = {
          method: 'requestPermissions',
          params: [
            {
              'testMethod': {
                caveats: [
                  {
                    type: 'forceParams',
                    value: [0, 1, 2, 3],
                    name: 'a',
                  },
                  {
                    type: 'forceParams',
                    value: [0, 1, 2, 3],
                    name: 'a',
                  },
                ],
              },
            },
          ],
        };

        await sendRpcMethodWithResponse(ctrl, domain, req);
        t.notOk(true, 'should have thrown');

      } catch (err) {
        t.ok(err.message.indexOf('Invalid caveats.') !== -1, 'throws expected error');
      }
      t.end();
    });
  } catch (err) {
    t.notOk(err, 'should not throw');
  }
  t.end();
});

test('updateCaveatFor', async (t) => {

  const domain = { origin: 'www.metamask.io' };

  const cav1 = {
    type: 'forceParams',
    value: [0, 1, 2, 3],
    name: 'a',
  };

  const cav2 = {
    type: 'filterResponse',
    value: [0, 1, 2, 3, 4, 5],
    name: 'c',
  };

  const ctrl = new CapabilitiesController({
    restrictedMethods: {
      'testMethod': {
        method: (req, res, _next, end) => {
          res.result = req.params;
          end();
        },
      },
    },

    // All permissions automatically approved
    requestUserApproval: async (permissionsRequest) => {
      return permissionsRequest.permissions;
    },
  },
  {
    domains: {},
  });

  try {

    let req = {
      method: 'requestPermissions',
      params: [
        {
          'testMethod': {
            caveats: [
              { ...cav1 }, { ...cav2 },
            ],
          },
        },
      ],
    };

    await sendRpcMethodWithResponse(ctrl, domain, req);

    test('updateCaveatFor throws on non-existing domain', async (t) => {

      try {

        ctrl.updateCaveatFor(
          'foo.bar.xyz', 'testMethod', 'a', [0, 1],
        );

        t.notOk(true, 'should have thrown');

      } catch (err) {
        t.ok(err, 'did throw');
      }
      t.end();
    });

    test('updateCaveatFor throws on non-existing method', async (t) => {

      try {

        ctrl.updateCaveatFor(
          domain.origin, 'doesNotExist', 'a', [0, 1],
        );

        t.notOk(true, 'should have thrown');

      } catch (err) {
        t.ok(err, 'did throw');
      }
      t.end();
    });

    test('updateCaveatFor does not alter state after throwing', async (t) => {

      try {

        req = {
          method: 'testMethod',
          params: [],
        };
        const result = await sendRpcMethodWithResponse(ctrl, domain, req);

        t.ok(result, 'should succeed');
        t.deepEqual(result, [0, 1, 2, 3], 'returned the correct subset');

      } catch (err) {
        t.notOk(err, 'should not throw');
      }
      t.end();
    });

    test('updateCaveatFor successfully updates caveats', async (t) => {

      try {

        cav1.value = [0, 1, 2];

        ctrl.updateCaveatFor(
          domain.origin, 'testMethod', 'a', cav1.value,
        );

        req = {
          method: 'testMethod',
          params: [],
        };
        const result = await sendRpcMethodWithResponse(ctrl, domain, req);

        t.ok(result, 'should succeed');
        t.deepEqual(result, [0, 1, 2], 'returned the correct subset');

      } catch (err) {
        t.notOk(err, 'should not throw');
      }
      t.end();
    });

    test('updateCaveatFor throws on non-existing caveat with valid name', async (t) => {

      try {

        ctrl.updateCaveatFor(
          domain.origin, 'testMethod', 'b', [0, 1],
        );

        t.notOk(true, 'should have thrown');

      } catch (err) {
        t.ok(err, 'did throw');
      }
      t.end();
    });

    test('updateCaveatFor throws on existing caveat but different value type', async (t) => {

      try {

        ctrl.updateCaveatFor(
          domain.origin, 'testMethod', 'b', 'foo',
        );

        t.notOk(true, 'should have thrown');

      } catch (err) {
        t.ok(err, 'did throw');
      }
      t.end();
    });

    test('final state after multiple updateCaveatFor calls', async (t) => {

      try {

        req = {
          method: 'testMethod',
          params: [],
        };
        const result = await sendRpcMethodWithResponse(ctrl, domain, req);

        t.ok(result, 'should succeed');
        t.deepEqual(result, [0, 1, 2], 'returned the correct subset');

        const perms = ctrl.getPermissionsForDomain(domain.origin);
        t.ok(perms.length === 1, 'expected number of permissions remain');
        const { caveats } = perms[0];
        t.ok(caveats.length === 2, 'expected number of caveats remain');
        const c1 = caveats.find((p) => p.name === 'a');
        t.deepEqual(c1, cav1, 'caveat "a" as expected');
        const c2 = caveats.find((p) => p.name === 'c');
        t.deepEqual(c2, cav2, 'caveat "b" as expected');

      } catch (err) {
        t.notOk(err, 'should not throw');
      }
      t.end();
    });

  } catch (err) {
    t.notOk(err, 'should not throw');
  }
  t.end();
});

test('addCaveatFor', async (t) => {

  const domain = { origin: 'www.metamask.io' };

  const cav1 = {
    type: 'forceParams',
    value: [0, 1, 2, 3],
    name: 'a',
  };

  const cav2 = {
    type: 'filterResponse',
    value: [0, 1, 2, 3, 4, 5],
    name: 'c',
  };

  const ctrl = new CapabilitiesController({
    restrictedMethods: {
      'testMethod': {
        method: (req, res, _next, end) => {
          res.result = req.params;
          end();
        },
      },
    },

    // All permissions automatically approved
    requestUserApproval: async (permissionsRequest) => {
      return permissionsRequest.permissions;
    },
  },
  {
    domains: {},
  });

  try {

    let req = {
      method: 'requestPermissions',
      params: [
        {
          'testMethod': {
            caveats: [
              { ...cav1 }, { ...cav2 },
            ],
          },
        },
      ],
    };

    await sendRpcMethodWithResponse(ctrl, domain, req);

    test('addCaveatFor throws on non-existing domain', async (t) => {

      try {

        ctrl.addCaveatFor(
          'foo.bar.xyz', 'testMethod', {
            type: 'forceParams',
            value: [0, 1],
            name: 'a',
          },
        );

        t.notOk(true, 'should have thrown');

      } catch (err) {
        t.ok(err, 'did throw');
      }
      t.end();
    });

    test('addCaveatFor throws on non-existing method', async (t) => {

      try {

        ctrl.addCaveatFor(
          domain.origin, 'doesNotExist', {
            type: 'forceParams',
            value: [0, 1],
            name: 'a',
          },
        );

        t.notOk(true, 'should have thrown');

      } catch (err) {
        t.ok(err, 'did throw');
      }
      t.end();
    });

    test('addCaveatFor does not alter state after throwing', async (t) => {

      try {

        req = {
          method: 'testMethod',
          params: [],
        };
        const result = await sendRpcMethodWithResponse(ctrl, domain, req);

        t.ok(result, 'should succeed');
        t.deepEqual(result, [0, 1, 2, 3], 'returned the correct subset');

      } catch (err) {
        t.notOk(err, 'should not throw');
      }
      t.end();
    });

    test('addCaveatFor successfully adds caveats', async (t) => {

      try {

        ctrl.addCaveatFor(
          domain.origin, 'testMethod', {
            type: 'forceParams',
            value: cav1.value,
            name: 'b',
          },
        );

        req = {
          method: 'testMethod',
          params: [],
        };
        const result = await sendRpcMethodWithResponse(ctrl, domain, req);

        t.ok(result, 'should succeed');
        t.deepEqual(result, cav1.value, 'returned the correct subset');

      } catch (err) {
        t.notOk(err, 'should not throw');
      }
      t.end();
    });

    test('addCaveatFor throws on adding existing name', async (t) => {

      try {

        ctrl.addCaveatFor(
          domain.origin, 'testMethod', {
            type: 'forceParams',
            value: [0, 1],
            name: 'b',
          },
        );

        t.notOk(true, 'should have thrown');

      } catch (err) {
        t.ok(err, 'did throw');
      }
      t.end();
    });

    test('addCaveatFor throws on adding non-existing type', async (t) => {

      try {

        ctrl.addCaveatFor(
          domain.origin, 'testMethod', {
            type: 'NON_EXISTING_TYPE',
            value: [0, 1],
            name: 'NOT_PREVIOUSLY_ADDED',
          },
        );

        t.notOk(true, 'should have thrown');

      } catch (err) {
        t.ok(err, 'did throw');
      }
      t.end();
    });

    test('final state after multiple addCaveatFor calls', async (t) => {

      try {

        req = {
          method: 'testMethod',
          params: [],
        };
        const result = await sendRpcMethodWithResponse(ctrl, domain, req);

        t.ok(result, 'should succeed');
        t.deepEqual(result, cav1.value, 'returned the correct subset');

        const perms = ctrl.getPermissionsForDomain(domain.origin);
        t.ok(perms.length === 1, 'has expected number of permissions');
        const { caveats } = perms[0];
        t.ok(caveats.length === 3, 'has expected number of caveats');
        let cav = caveats.find((p) => p.name === 'a');
        t.deepEqual(cav, cav1, 'caveat "a" as expected');
        cav = caveats.find((p) => p.name === 'b');
        t.deepEqual(cav, { ...cav1, name: 'b' }, 'caveat "b" as expected');
        cav = caveats.find((p) => p.name === 'c');
        t.deepEqual(cav, cav2, 'caveat "c" as expected');

      } catch (err) {
        t.notOk(err, 'should not throw');
      }
      t.end();
    });

  } catch (err) {
    t.notOk(err, 'should not throw');
  }
  t.end();
});

test('caveat getters', async (t) => {

  const domain = { origin: 'www.metamask.io' };

  const cav1 = {
    type: 'forceParams',
    value: [0, 1, 2, 3],
    name: 'a',
  };

  const cav2 = {
    type: 'filterResponse',
    value: [0, 1, 2, 3, 4, 5],
    name: 'c',
  };

  const ctrl = new CapabilitiesController({
    restrictedMethods: {
      'testMethod': {
        method: (req, res, _next, end) => {
          res.result = req.params;
          end();
        },
      },
    },

    // All permissions automatically approved
    requestUserApproval: async (permissionsRequest) => {
      return permissionsRequest.permissions;
    },
  },
  {
    domains: {},
  });

  try {

    const req = {
      method: 'requestPermissions',
      params: [
        {
          'testMethod': {
            caveats: [
              { ...cav1 }, { ...cav2 },
            ],
          },
        },
      ],
    };

    await sendRpcMethodWithResponse(ctrl, domain, req);

    test('getCaveat retrieves specific named caveat', async (t) => {

      try {

        const cav = ctrl.getCaveat(
          domain.origin, 'testMethod', 'a',
        );

        t.deepEqual(cav, cav1);

      } catch (err) {
        t.notOk(err, 'should not throw');
      }
      t.end();
    });

    test('getCaveats retrieves all caveats', async (t) => {

      try {

        const caveats = ctrl.getCaveats(
          domain.origin, 'testMethod',
        );

        t.ok(caveats.length === 2, 'has expected number of caveats');
        let cav = caveats.find((p) => p.name === 'a');
        t.deepEqual(cav, cav1, 'caveat "a" as expected');
        cav = caveats.find((p) => p.name === 'c');
        t.deepEqual(cav, cav2, 'caveat "c" as expected');

      } catch (err) {
        t.notOk(err, 'should not throw');
      }
      t.end();
    });

    test('getting caveat(s) for unknown domain returns undefined', async (t) => {

      try {

        let cav = ctrl.getCaveat(
          'not.a.known.domain', 'testMethod', 'a',
        );
        t.ok(cav === undefined, 'getCaveat returned undefined');
        cav = ctrl.getCaveats(
          'not.a.known.domain', 'testMethod',
        );
        t.ok(cav === undefined, 'getCaveats returned undefined');

      } catch (err) {
        t.notOk(err, 'should not throw');
      }
      t.end();
    });

    test('getting caveat(s) for unknown method returns undefined', async (t) => {

      try {

        let cav = ctrl.getCaveat(
          domain.origin, 'unknownMethod', 'a',
        );
        t.ok(cav === undefined, 'getCaveat returned undefined');
        cav = ctrl.getCaveats(
          domain.origin, 'unknownMethod',
        );
        t.ok(cav === undefined, 'getCaveats returned undefined');

      } catch (err) {
        t.notOk(err, 'should not throw');
      }
      t.end();
    });

    test('getCaveat for unknown caveat name returns undefined', async (t) => {

      try {

        const cav = ctrl.getCaveat(
          domain.origin, 'testMethod', 'unknownName',
        );
        t.ok(cav === undefined, 'getCaveat returned undefined');

      } catch (err) {
        t.notOk(err, 'should not throw');
      }
      t.end();
    });

  } catch (err) {
    t.notOk(err, 'should not throw');
  }
  t.end();
});
