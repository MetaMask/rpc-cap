/// <reference path="../@types/json-rpc-engine.d.ts" />
import { JsonRpcMiddleware } from "json-rpc-capabilities-middleware/src/@types/json-rpc-engine";
import { unauthorized } from "json-rpc-capabilities-middleware/src/errors";

interface ISerializedCaveat {
  type: string;
  value?: any;
}

export type ICaveatFunction = JsonRpcMiddleware;

export type ICaveatFunctionGenerator = (caveat:ISerializedCaveat) => ICaveatFunction;

export const onlyReturnMembers: ICaveatFunctionGenerator = function onlyReturnMembers (serialized: ISerializedCaveat) {
  const permittedValues:any[] = serialized.value;
  return (_req, res, next, _end) => {
    next((done) => {
      const { result } = res;
      if (!Array.isArray(result)) {
        res.result = unauthorized();
        return done();
      }

      res.result = res.result.filter((item: any) => {
        return permittedValues.includes(item);                
      })

      return done();
    })
  }
}
