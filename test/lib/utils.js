const { JsonRpcEngine } = require('json-rpc-engine');

async function sendRpcMethodWithResponse(ctrl, domain, req) {
  return new Promise((resolve, reject) => {
    const engine = new JsonRpcEngine();
    engine.push(ctrl.providerMiddlewareFunction.bind(ctrl, domain));

    engine.handle(req, (err, res) => {
      if (err || res.error) {
        return reject(err);
      }

      return resolve(res.result);
    });
  });
}

module.exports = {
  sendRpcMethodWithResponse,
};
