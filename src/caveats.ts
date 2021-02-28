import { JsonRpcMiddleware } from 'json-rpc-engine';
import isSubset from 'is-subset';
import equal from 'fast-deep-equal';
import { IOcapLdCaveat } from './@types/ocap-ld';
import { unauthorized } from './errors';

export type ICaveatFunction = JsonRpcMiddleware;

export type ICaveatFunctionGenerator = (caveat: IOcapLdCaveat) => ICaveatFunction;

export const caveatFunctions = {
  filterResponse,
  forceParams,
  limitResponseLength,
  requireParamsIsSubset,
  requireParamsIsSuperset,
};

export const CaveatTypes = Object.keys(caveatFunctions).reduce((map, name) => {
  map[name] = name;
  return map;
}, {} as Record<string, string>);

/**
 * Require that request.params is a subset of or equal to the caveat value.
 * Arrays are order-dependent, objects are order-independent.
 */
export function requireParamsIsSubset(serialized: IOcapLdCaveat): ICaveatFunction {
  const { value } = serialized;
  return (req, res, next, end): void => {
    // Ensure that the params are a subset of or equal to the caveat value
    if (!isSubset(value, req.params)) {
      res.error = unauthorized({ data: req });
      return end(res.error);
    }

    return next();
  };
}

/**
 * Require that request.params is a superset of or equal to the caveat value.
 * Arrays are order-dependent, objects are order-independent.
 */
export function requireParamsIsSuperset (serialized: IOcapLdCaveat): ICaveatFunction {
  const { value } = serialized;
  return (req, res, next, end): void => {
    // Ensure that the params are a superset of or equal to the caveat value
    if (!isSubset(req.params, value)) {
      res.error = unauthorized({ data: req });
      return end(res.error);
    }

    return next();
  };
}

/*
 * Filters array results deeply.
 */
export function filterResponse(serialized: IOcapLdCaveat): ICaveatFunction {
  const { value } = serialized;
  return (_req, res, next, _end): void => {

    next((done) => {
      if (Array.isArray(res.result)) {
        res.result = res.result.filter((item) => {
          const findResult = value.find((v: unknown) => {
            return equal(v, item);
          });
          return findResult !== undefined;
        });
      }
      done();
    });
  };
}

/*
 * Limits array results to a specific integer length.
 */
export function limitResponseLength(serialized: IOcapLdCaveat): ICaveatFunction {
  const { value } = serialized;
  return (_req, res, next, _end): void => {

    next((done) => {
      if (Array.isArray(res.result)) {
        res.result = res.result.slice(0, value);
      }
      done();
    });
  };
}

/*
 * Forces the method to be called with given params.
 */
export function forceParams(serialized: IOcapLdCaveat): ICaveatFunction {
  const { value } = serialized;
  return (req, _, next): void => {
    req.params = Array.isArray(value) ? [...value] : { ...value };
    next();
  };
}
