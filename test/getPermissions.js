const test = require('tape');
const CapabilitiesController = require('../dist').CapabilitiesController;
const equal = require('fast-deep-equal');

function noop () {}

const arbitraryCaps = [
  {
    domain: 'bar',
    method: 'restricted',
    granter: 'baz',
    id: 'abc',
  },
  {
    domain: 'baz',
    method: 'restricted2',
    granter: 'bar',
    id: 'xyz',
  },
];

test('getPermissions with none returns empty object', async (t) => {
  const expected = [];

  const ctrl = new CapabilitiesController({
    requestUserApproval: noop,
  });

  const domain = { origin: 'login.metamask.io' };
  const req = { method: 'getPermissions' };
  const res = {};

  ctrl.providerMiddlewareFunction(domain, req, res, next, end);

  function next () {
    t.ok(false, 'next should not be called');
    t.end();
  }

  function end (reason) {
    t.error(reason, 'error thrown');
    t.ok(equal(res.result, expected), 'should be equal');
    t.end();
  }
});

test('getPermissions with some returns them', async (t) => {
  const expected = arbitraryCaps;

  const ctrl = new CapabilitiesController({
    requestUserApproval: noop,
  },
  {
    domains: {
      'login.metamask.io': {
        permissions: expected,
      },
    },
  });

  const domain = { origin: 'login.metamask.io' };
  const req = { method: 'getPermissions' };
  const res = {};

  ctrl.providerMiddlewareFunction(domain, req, res, next, end);

  function next () {
    t.ok(false, 'next should not be called');
    t.end();
  }

  function end (reason) {
    t.error(reason, 'error thrown');
    t.ok(equal(res.result, expected), 'should be equal');
    t.end();
  }
});
