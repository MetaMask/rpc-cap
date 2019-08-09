const test = require('tape')
const CapabilitiesController = require('../dist').CapabilitiesController;
const equal = require('fast-deep-equal')

const UNAUTHORIZED_CODE = require('eth-json-rpc-errors').ERROR_CODES.eth.unauthorized;

test('restricted permission gets restricted provider', async (t) => {
  const name = 'Glen Runciter';

  const ctrl = new CapabilitiesController({

    // Auto fully approve:
    requestUserApproval: (reqPerms) => Promise.resolve(reqPerms.permissions),

    restrictedMethods: {
    
      'getName': {
        description: 'Returns user name',
        method: (req, res, next, end) => {
          res.result = name;
          end();
        }
      },

      'greet': {
        description: 'Greets the current name, if allowed.',
        method: (req, res, next, end, provider) => {
          provider.send({ method: 'getName' })
          .then((nameRes) => {
            const gotName = nameRes.result;
            res.result = `Greetings, ${gotName}`;
            end();
          })
          .catch((reason) => {
            res.error = reason;
            end(reason);
          })
        }
      },
    },
  })

  const domain = { origin: 'login.metamask.io' }
  let req = { method: 'greet' }

  try {
    let res = await sendRpcMethodWithResponse(ctrl, domain, req);

    t.fail('should not complete successfully.')
    t.end();

  } catch (error) {
    t.ok(error, 'throws an error');
    t.equal(error.code, 4100, 'Throws auth error');
    t.end();
  }
});


test('restricted permission gets domain permissions', async (t) => {
  const name = 'Glen Runciter';

  const ctrl = new CapabilitiesController({

    // Auto fully approve:
    requestUserApproval: (reqPerms) => Promise.resolve(reqPerms.permissions),

    restrictedMethods: {
    
      'getName': {
        description: 'Returns user name',
        method: (req, res, next, end) => {
          res.result = name;
          end();
        }
      },

      'greet': {
        description: 'Greets the current name, if allowed.',
        method: (req, res, next, end, provider) => {
          provider.send({ method: 'getName' })
          .then((nameRes) => {
            const gotName = nameRes.result;
            res.result = `Greetings, ${gotName}`;
            end();
          })
          .catch((reason) => {
            res.error = reason;
            end(reason);
          })
        }
      },
    },
  })

  const domain = { origin: 'login.metamask.io' }

  let permReq = {
    method: 'requestPermissions',
    params: [
      { 
        getName: {},
        greet: {},
      }
    ]
  }

  let req = { method: 'greet' }

  try {
    await sendRpcMethodWithResponse(ctrl, domain, permReq);
    let res = await sendRpcMethodWithResponse(ctrl, domain, req);

    t.ok(res, 'should complete successfully.')
    t.ok(res.result.includes(name), 'greeting included name')
    t.notEqual(res.result.indexOf(name), 0, 'Name is not beginning.')
    t.end();

  } catch (error) {
    t.notOk(error, 'should not throw an error');
    t.end();
  }
});

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


