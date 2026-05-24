import {
  type ActorResolver,
  CompositeDidDocumentResolver,
  CompositeHandleResolver,
  type DidDocumentResolver,
  DohJsonHandleResolver,
  LocalActorResolver,
  PlcDidDocumentResolver,
  type ResolveDidDocumentOptions,
  WebDidDocumentResolver,
  WellKnownHandleResolver,
} from '@atcute/identity-resolver';
import type { Did } from '@atcute/lexicons';

// The resolved DID document type, derived from the resolver interface so we
// don't need a direct dependency on `@atcute/identity` just for the type.
type DidDocument = Awaited<ReturnType<DidDocumentResolver['resolve']>>;

const DID_DOC_CACHE_TTL_SECONDS = 5 * 60; // 5 minutes (see README "Configuration")

/**
 * Wraps an inner DID-document resolver with a KV cache. DID documents change
 * rarely, so a short TTL massively cuts PLC/web lookups during JWT verification.
 */
export class CachedDidDocumentResolver implements DidDocumentResolver {
  readonly #inner: DidDocumentResolver;
  readonly #cache: KVNamespace;

  constructor(inner: DidDocumentResolver, cache: KVNamespace) {
    this.#inner = inner;
    this.#cache = cache;
  }

  async resolve(did: Did, options?: ResolveDidDocumentOptions): Promise<DidDocument> {
    const key = `diddoc:${did}`;

    if (!options?.noCache) {
      const cached = await this.#cache.get<DidDocument>(key, 'json');
      if (cached !== null) {
        return cached;
      }
    }

    const doc = await this.#inner.resolve(did, options);
    await this.#cache.put(key, JSON.stringify(doc), {
      expirationTtl: DID_DOC_CACHE_TTL_SECONDS,
    });
    return doc;
  }
}

/** Build the plc+web composite resolver, wrapped in the KV cache. */
export function makeResolver(cache: KVNamespace): DidDocumentResolver {
  const composite = new CompositeDidDocumentResolver({
    methods: {
      plc: new PlcDidDocumentResolver(),
      web: new WebDidDocumentResolver(),
    },
  });
  return new CachedDidDocumentResolver(composite, cache);
}

const DOH_URL = 'https://cloudflare-dns.com/dns-query';

/**
 * Resolve an actor (handle OR DID) to `{ did, handle, pds }`, reusing the
 * KV-cached DID-document resolver (so the PDS lookup is cached ~5min). Used to
 * find the DM bot's PDS at runtime — no hardcoded service endpoint needed.
 */
export function makeActorResolver(cache: KVNamespace): ActorResolver {
  return new LocalActorResolver({
    handleResolver: new CompositeHandleResolver({
      methods: {
        http: new WellKnownHandleResolver(),
        dns: new DohJsonHandleResolver({ dohUrl: DOH_URL }),
      },
    }),
    didDocumentResolver: makeResolver(cache),
  });
}

/**
 * Best-effort handle for a DID, read from the DID document's `alsoKnownAs`
 * (`at://<handle>`). For display only (the claimed handle is not bidirectionally
 * verified). Returns null on any failure.
 */
export async function resolveHandle(cache: KVNamespace, did: Did): Promise<string | null> {
  try {
    const doc = await makeResolver(cache).resolve(did);
    const aka = doc.alsoKnownAs?.find((uri) => uri.startsWith('at://'));
    return aka !== undefined ? aka.slice('at://'.length) : null;
  } catch {
    return null;
  }
}
