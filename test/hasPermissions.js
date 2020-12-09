const test = require('tape');
const { CapabilitiesController } = require('../dist');
const clone = require('clone');

function noop () {}

const domain1 = 'foo.com';
const domain2 = 'bar.io';

const method1 = 'restricted';
const method2 = 'restricted2';

const domains = {
  [domain1]: {
    permissions: [
      {
        parentCapability: method1,
        id: 'abc',
      },
    ],
  },
  [domain2]: {
    permissions: [
      {
        parentCapability: method2,
        id: 'xyz',
      },
    ],
  },
};

test('hasPermissions returns false if no permissions', (t) => {
  const ctrl = new CapabilitiesController({
    requestUserApproval: noop,
  });

  t.equal(ctrl.hasPermissions(domain1), false, 'should return false');
  t.end();
});

test('hasPermission returns false if no permissions', (t) => {
  const ctrl = new CapabilitiesController({
    requestUserApproval: noop,
  });

  t.equal(ctrl.hasPermissions(domain1, method1), false, 'should return false');
  t.end();
});

test('hasPermissions returns true with permissions', (t) => {
  const ctrl = new CapabilitiesController({
    requestUserApproval: noop,
  },
  {
    domains: clone(domains),
  });

  t.equal(ctrl.hasPermissions(domain1), true, 'should return true for domain1');
  t.equal(ctrl.hasPermissions(domain2), true, 'should return true for domain2');
  t.end();
});

test('hasPermission returns true with permissions and correct method', (t) => {
  const ctrl = new CapabilitiesController({
    requestUserApproval: noop,
  },
  {
    domains: clone(domains),
  });

  t.equal(
    ctrl.hasPermission(domain1, method1),
    true,
    'should return true for domain1 and method1'
  );
  t.equal(
    ctrl.hasPermission(domain2, method2),
    true,
    'should return true for domain2 and method2'
  );
  t.end();
});

test('hasPermissions returns with permissions but wrong domain', (t) => {
  const ctrl = new CapabilitiesController({
    requestUserApproval: noop,
  },
  {
    domains: {
      [domain1]: clone(domains[domain1]),
    },
  });

  t.equal(ctrl.hasPermissions(domain1), true, 'should return true for domain1');
  t.equal(ctrl.hasPermissions(domain2), false, 'should return false for domain2');
  t.end();
});

test('hasPermission returns false with permissions but wrong method', (t) => {
  const ctrl = new CapabilitiesController({
    requestUserApproval: noop,
  },
  {
    domains: clone(domains),
  });

  t.equal(
    ctrl.hasPermission(domain1, method2),
    false,
    'should return false for domain1 and method2'
  );
  t.equal(
    ctrl.hasPermission(domain2, method1),
    false,
    'should return false for domain2 and method1'
  );
  t.end();
});
