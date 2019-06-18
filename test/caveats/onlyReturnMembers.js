const test = require('tape');
const CapabilitiesController = require('../../dist').CapabilitiesController
const { sendRpcMethodWithResponse } = require('../lib/utils')

// import CapabilitiesController from '../';

// TODO: Standardize!
// Maybe submit to https://github.com/ethereum/wiki/wiki/JSON-RPC-Error-Codes-Improvement-Proposal
const USER_REJECTION_CODE = 5


test('safe method should pass through', async (t) => {
  const WRITE_RESULT = 'impeccable result'

  const ctrl = new CapabilitiesController({
    requestUserApproval: async (options) => { return opts.options; },
    restrictedMethods: {
      getSecretNumbers: {
        description: 'Returns a list of sensitive numbers!',
        method: (req, res, next, end) => {
          res.result = [1,2,3,4];
          end();
        },
      }
    },
  }, {
      'domains': {
        'login.metamask.io': {
          'permissions': [
            {
              method: 'restricted',
              date: '0',
              granter: 'other.domain.com',
              caveats: [
                {
                  type: 'onlyReturnMembers',
                  value: [1, 2],
                }
              ]
            }
          ]
        },
        'other.domain.com': {
          'permissions': [
            {
              method: 'restricted',
              date: 1547176021698,
              caveats: [
                {
                  type: 'onlyReturnMembers',
                  value: [2, 3],
                }
              ]
            }
          ]
        }
     },
  })

  const domain = {origin: 'login.metamask.io'}
  let req = { method: 'getSecretNumbers' }

  try {
    let res = await sendRpcMethodWithResponse(ctrl, domain, req)
    t.equal(res, [2], 'Should merge to only return an array with "2".')
    t.end()
  } catch (err) {
    t.end(err);
  }
})

