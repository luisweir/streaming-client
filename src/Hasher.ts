import crypto from 'crypto';

export class Hasher {
    public async generateHash(key: string): Promise<string> {
        const keyUint8 = new TextEncoder().encode(key);
        const hashBuffer = await crypto.subtle.digest('SHA-256', keyUint8);
        const hashArray = Array.from(new Uint8Array(hashBuffer));
        const hashHex = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
        return hashHex;
    }
}