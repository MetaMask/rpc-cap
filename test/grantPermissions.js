const test = require('tape')
const CapabilitiesController = require('../dist').CapabilitiesController
const equal = require('fast-deep-equal')
const uuid = require('uuid/v4')

// TODO: Standardize!
// Maybe submit to https://github.com/ethereum/wiki/wiki/JSON-RPC-Error-Codes-Improvement-Proposal
const USER_REJECTION_CODE = 5

test('grantPermissions with no permission creates no permissions', async (t) => {
  const expected = []

  const ctrl = new CapabilitiesController({
    requestUserApproval: noop,
  })

  const domain = 'login.metamask.io'
  const otherDomain = 'other.domain.com'
  let req = {
    method: 'grantPermissions',
    params: [
      otherDomain,
      [
        {
          method: 'restricted',
        },
      ],
    ]
  }
  let res = {}

  ctrl.providerMiddlewareFunction(domain, req, res, next, end)

  function next() {
    t.ok(false, 'next should not be called')
    t.end()
  }

  function end(reason) {
    t.ok(reason, 'error thrown')
    t.equal(reason.code, 1, 'Auth error returned')
    t.ok(equal(ctrl.getPermissionsForDomain(otherDomain), expected), 'should have no permissions still')
    t.ok(equal(ctrl.getPermissionsForDomain(domain), expected), 'should have no permissions still')
    t.end()
  }
})

test('grantPermissions with permission creates permission', async (t) => {

  const expected = {
     domains: {
      'login.metamask.io': {
        permissions: [
          {
            method: 'restricted',
            date: '0',
          }
        ]
      },
      'other.domain.com': {
        permissions: [
          {
            method: 'restricted',
            granter: 'login.metamask.io',
          }
        ]
      }
    }
  }

  const ctrl = new CapabilitiesController({
    requestUserApproval: noop,
  },
  {
    domains: {
      'login.metamask.io': {
        permissions: [
          {
            method: 'restricted',
            date: '0',
          }
        ],
      }
    }
  })

  const granter = 'login.metamask.io'
  const grantee = 'other.domain.com'
  let req = {
    method: 'grantPermissions',
    params: [
      grantee,
      [
        {
          method: 'restricted',
        },
      ],
    ]
  }
  let res = {}

  ctrl.providerMiddlewareFunction(granter, req, res, next, end)

  function next() {
    t.ok(false, 'next should not be called')
    t.end()
  }

  function end(reason) {
    t.error(reason, 'error should not be thrown')
    t.notOk(reason, 'should throw no error')
    t.notOk(res.error, 'should assign no error')

    const granteePerms = ctrl.getPermissionsForDomain(grantee)

    t.ok(granteePerms[0].method === req.params[1][0].method, 'The requested permission was created.')
    t.end()
  }
})

test('grantPermissions with permission whose granter does not exist results in auth error', async (t) => {
  const ctrl = new CapabilitiesController({
    requestUserApproval: noop,
  },
  {
    domains: {
      'login.metamask.io': {
        permissions: [
          {
            method: 'restricted',
            granter: 'other.granter2.io',
            date: '0',
          }
        ],
      }
    }
  })

  const domain = 'login.metamask.io'
  const otherDomain = 'other.domain.com'
  let req = {
    method: 'grantPermissions',
    params: [
      otherDomain,
      [
        {
          method: 'restricted',
        },
      ],
    ]
  }
  let res = {}

  ctrl.providerMiddlewareFunction(domain, req, res, next, end)

  function next() {
    t.ok(false, 'next should not be called')
    t.end()
  }

  function end(reason) {
    t.ok(reason, 'error thrown')
    t.equal(reason.code, 1, 'Auth error returned')
    t.end()
  }
})

test('grantPermissions accumulates the same permission from different granters', async (t) => {

  const grantee = 'login.metamask.io'
  const granter1 = 'xyz.co.uk'
  const granter2 = 'abc.se'

  const expected = [
    {
      method: 'restricted',
      date: '0',
      granter: granter1,
    },
    {
      method: 'restricted',
      date: '0',
      granter: granter2,
    }
  ]

  const ctrl = new CapabilitiesController({
    requestUserApproval: noop,
  },
  {
    domains: {
      [grantee]: {
        permissions: [
          {
            method: 'restricted',
            date: '0',
            granter: granter1,
          }
        ],
      },
      [granter2]: {
        permissions: [
          {
            method: 'restricted',
            date: '0',
          }
        ],
      },
    }
  })

  let req = {
    method: 'grantPermissions',
    params: [
      grantee,
      [
        {
          method: 'restricted',
        },
      ],
    ]
  }
  let res = {}

  ctrl.providerMiddlewareFunction(granter2, req, res, next, end)

  function next() {
    t.ok(false, 'next should not be called')
    t.end()
  }

  function end(reason) {
    t.error(reason, 'error should not be thrown')
    t.notOk(reason, 'should throw no error')
    t.notOk(res.error, 'should assign no error')

    const otherPerms = ctrl.getPermissionsForDomain(grantee)

    let result
    for (let perm of otherPerms) {
        result = perm.method === 'restricted' && (
          perm.granter === granter1 ||
          perm.granter === granter2
        )
    }
    t.ok(result, 'the requested permission was created')
    t.end()
  }
})

test('grantPermissions replaces duplicate permissions', async (t) => {

  const grantee = 'login.metamask.io'
  const granter = 'xyz.co.uk'

  const oldPerm = {
    method: 'restricted',
    id: uuid(),
    date: Date.now(),
    granter: granter,
  }

  const ctrl = new CapabilitiesController({
    requestUserApproval: noop,
  },
  {
    domains: {
      [grantee]: {
        permissions: [
          oldPerm
        ],
      },
      [granter]: {
        permissions: [
          {
            method: 'restricted',
            date: '0',
            id: uuid(),
          }
        ],
      },
    }
  })

  let req = {
    method: 'grantPermissions',
    params: [
      grantee,
      [
        {
          method: 'restricted'
        },
      ],
    ]
  }
  let res = {}

  ctrl.providerMiddlewareFunction(granter, req, res, next, end)

  function next() {
    t.ok(false, 'next should not be called')
    t.end()
  }

  function end(reason) {
    t.error(reason, 'error should not be thrown')
    t.notOk(reason, 'should throw no error')
    t.notOk(res.error, 'should assign no error')

    const granteePerms = ctrl.getPermissionsForDomain(grantee)
    t.ok(granteePerms.length === 1, 'grantee domain has a single permission')

    const newPerm = granteePerms[0]
    t.ok(
      (
        newPerm.method === oldPerm.method &&
        newPerm.granter === oldPerm.granter &&
        // newPerm.date > oldPerm.date && // becomes identical in test
        newPerm.id !== oldPerm.id
      ), 'the requested permission was created'
    )
    t.end()
  }
})
function noop () {};