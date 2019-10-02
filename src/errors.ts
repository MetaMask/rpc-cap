import { JsonRpcRequest } from 'json-rpc-engine';

import { IEthErrors, IEthereumRpcError } from 'eth-json-rpc-errors/@types';

const ethErrors: IEthErrors = require('eth-json-rpc-errors').ethErrors;

function unauthorized (request?: JsonRpcRequest<any>): IEthereumRpcError<JsonRpcRequest<any>> {
  return ethErrors.provider.unauthorized({
    message: 'Unauthorized to perform action. Try requesting permission first using the `requestPermissions` method. More info available at https://github.com/MetaMask/json-rpc-capabilities-middleware',
    data: request
  });
}

function invalidReq (request?: JsonRpcRequest<any>): IEthereumRpcError<JsonRpcRequest<any>> {
  return ethErrors.rpc.invalidRequest({ data: request });
}

function methodNotFound (data?: any): IEthereumRpcError<JsonRpcRequest<any>> {
  return ethErrors.rpc.methodNotFound({ data });
}

function userRejectedRequest (request?: JsonRpcRequest<any>): IEthereumRpcError<JsonRpcRequest<any>> {
  return ethErrors.provider.userRejectedRequest({ data: request });
}
export { unauthorized, methodNotFound, invalidReq, userRejectedRequest };
