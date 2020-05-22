/**
 * The schema used to serialize an assigned permission for a method to a domain.
 *
 * Roughly implements the ocap-ld schema:
 * https://w3c-ccg.github.io/ocap-ld/
 *
 * Does not currently include signatures or nested delegated capabilities.
 * Both of these would be good extensions later on, and some prior work has been done
 * in that direction at digitalbazaar:
 * https://github.com/digitalbazaar/ocapld.js/
 */
interface IOcapLdCapability {
  '@context': string[];
  // A GUID representing this method.
  id: string;
  // A pointer to the resource to invoke, like an API url,
  // or the method name (in the case of a local API).
  parentCapability: string;
  // A globally unique identifier representing the valid holder/invoker of this capability.
  invoker: string;
  // The issuing date, in UNIX epoch time
  date?: number;
  // An optional array of caveat objects.
  caveats?: IOcapLdCaveat[];
  proof?: IOcapLdProof;
}

export interface IOcapLdCaveat {
  // A type identifying the type of caveat.
  type: string;
  // Any additional data required to enforce the caveat type.
  value?: any;
  // Unique identifier for use in the client layer
  name?: string;
}

export interface IOcapLdProof {
  type: string;
  proofPurpose: 'capabilityDelegation' | 'capabilityInvocation';
  // A date string
  created: string;
  // A link to the creator.
  creator: string;
  // Dependent on the type, an arbitrary signature value.
  signatureValue?: string;
}
