import { JsonRpcRequest } from 'json-rpc-engine';

import { IEthErrors, IEthereumRpcError } from 'eth-json-rpc-errors/@types';

const ethErrors: IEthErrors = require('eth-json-rpc-errors').ethErrors;

interface ErrorArg {
  message?: string,
  data?: JsonRpcRequest<any> | any
}

interface MethodNotFoundArg extends ErrorArg {
  methodName?: string,
}

function unauthorized (arg?: ErrorArg): IEthereumRpcError<JsonRpcRequest<any>> {
  return ethErrors.provider.unauthorized({
    message: (arg && arg.message) || 'Unauthorized to perform action. Try requesting permission first using the `requestPermissions` method. More info available at https://github.com/MetaMask/rpc-cap',
    data: (arg && arg.data) || undefined
  });
}

const invalidReq = ethErrors.rpc.invalidRequest

const internalError = ethErrors.rpc.internal

function methodNotFound (opts: MethodNotFoundArg): IEthereumRpcError<JsonRpcRequest<any>> {
  const message = (
    opts.methodName
      ? `The method '${opts.methodName}' does not exist / is not available.`
      : null
  )
  return ethErrors.rpc.methodNotFound({ data: opts.data, message });
}

function userRejectedRequest (request?: JsonRpcRequest<any>): IEthereumRpcError<JsonRpcRequest<any>> {
  return ethErrors.provider.userRejectedRequest({ data: request });
}
export { unauthorized, methodNotFound, invalidReq, internalError, userRejectedRequest, IEthErrors };
