// Software authenticator for protocol tests only. Private keys never leave this fixture.
import {
  generateKeyPairSync,
  randomBytes,
  createHash,
  sign,
} from 'node:crypto';
const digest = (b) => createHash('sha256').update(b).digest();
function head(major, n) {
  if (n < 24) return Buffer.from([(major << 5) | n]);
  if (n < 256) return Buffer.from([(major << 5) | 24, n]);
  const b = Buffer.alloc(3);
  b[0] = (major << 5) | 25;
  b.writeUInt16BE(n, 1);
  return b;
}
function cbor(value) {
  if (Buffer.isBuffer(value))
    return Buffer.concat([head(2, value.length), value]);
  if (typeof value === 'string') {
    const b = Buffer.from(value);
    return Buffer.concat([head(3, b.length), b]);
  }
  if (typeof value === 'number')
    return head(value < 0 ? 1 : 0, value < 0 ? -1 - value : value);
  const entries =
    value instanceof Map ? [...value.entries()] : Object.entries(value);
  return Buffer.concat([
    head(5, entries.length),
    ...entries.flatMap(([k, v]) => [cbor(k), cbor(v)]),
  ]);
}
export function authenticator() {
  const { privateKey, publicKey } = generateKeyPairSync('ec', {
    namedCurve: 'prime256v1',
  });
  const jwk = publicKey.export({ format: 'jwk' });
  const id = randomBytes(32);
  const idText = id.toString('base64url');
  let registeredUserId;
  const cose = cbor(
    new Map([
      [1, 2],
      [3, -7],
      [-1, 1],
      [-2, Buffer.from(jwk.x, 'base64url')],
      [-3, Buffer.from(jwk.y, 'base64url')],
    ]),
  );
  function client(type, options, origin) {
    return Buffer.from(
      JSON.stringify({
        type,
        challenge: options.challenge,
        origin,
        crossOrigin: false,
      }),
    );
  }
  return {
    id: idText,
    register(
      options,
      { origin = 'http://localhost:3000', verified = true } = {},
    ) {
      registeredUserId = options.user.id;
      const clientData = client('webauthn.create', options, origin);
      const length = Buffer.alloc(2);
      length.writeUInt16BE(id.length);
      const authData = Buffer.concat([
        digest(options.rp.id),
        Buffer.from([verified ? 0x45 : 0x41]),
        Buffer.alloc(4),
        Buffer.alloc(16),
        length,
        id,
        cose,
      ]);
      return {
        id: idText,
        rawId: idText,
        type: 'public-key',
        clientExtensionResults: {},
        response: {
          clientDataJSON: clientData.toString('base64url'),
          attestationObject: cbor({
            fmt: 'none',
            attStmt: {},
            authData,
          }).toString('base64url'),
          transports: ['internal'],
        },
      };
    },
    authenticate(
      options,
      {
        origin = 'http://localhost:3000',
        counter = 1,
        verified = true,
        userHandle,
      } = {},
    ) {
      const clientData = client('webauthn.get', options, origin);
      const n = Buffer.alloc(4);
      n.writeUInt32BE(counter);
      const authData = Buffer.concat([
        digest(options.rpId),
        Buffer.from([verified ? 5 : 1]),
        n,
      ]);
      return {
        id: idText,
        rawId: idText,
        type: 'public-key',
        clientExtensionResults: {},
        response: {
          clientDataJSON: clientData.toString('base64url'),
          authenticatorData: authData.toString('base64url'),
          signature: sign(
            'sha256',
            Buffer.concat([authData, digest(clientData)]),
            privateKey,
          ).toString('base64url'),
          userHandle: userHandle ?? registeredUserId,
        },
      };
    },
  };
}
