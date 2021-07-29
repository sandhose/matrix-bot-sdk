import * as expect from "expect";
import * as simple from "simple-mock";
import {
    OTKAlgorithm,
    OTKCounts,
    RoomEncryptionAlgorithm,
} from "../../src";
import { createTestClient, TEST_DEVICE_ID } from "../MatrixClientTest";
import { feedOlmAccount } from "../TestUtils";

describe('CryptoClient', () => {
    it('should not have a device ID or be ready until prepared', async () => {
        const userId = "@alice:example.org";
        const { client } = createTestClient(null, userId, true);

        client.getWhoAmI = () => Promise.resolve({ user_id: userId, device_id: TEST_DEVICE_ID });
        client.uploadDeviceKeys = () => Promise.resolve({});
        client.uploadDeviceOneTimeKeys = () => Promise.resolve({});
        client.checkOneTimeKeyCounts = () => Promise.resolve({});

        expect(client.crypto).toBeDefined();
        expect(client.crypto.clientDeviceId).toBeFalsy();
        expect(client.crypto.isReady).toEqual(false);

        await client.crypto.prepare([]);

        expect(client.crypto.clientDeviceId).toEqual(TEST_DEVICE_ID);
        expect(client.crypto.isReady).toEqual(true);
    });

    describe('prepare', () => {
        it('should prepare the room tracker', async () => {
            const userId = "@alice:example.org";
            const roomIds = ["!a:example.org", "!b:example.org"];
            const { client } = createTestClient(null, userId, true);

            client.getWhoAmI = () => Promise.resolve({ user_id: userId, device_id: TEST_DEVICE_ID });
            client.uploadDeviceKeys = () => Promise.resolve({});
            client.uploadDeviceOneTimeKeys = () => Promise.resolve({});
            client.checkOneTimeKeyCounts = () => Promise.resolve({});

            const prepareSpy = simple.stub().callFn((rids: string[]) => {
                expect(rids).toBe(roomIds);
                return Promise.resolve();
            });

            (<any>client.crypto).roomTracker.prepare = prepareSpy; // private member access

            await client.crypto.prepare(roomIds);
            expect(prepareSpy.callCount).toEqual(1);
        });

        it('should use a stored device ID', async () => {
            const userId = "@alice:example.org";
            const { client } = createTestClient(null, userId, true);

            await client.cryptoStore.setDeviceId(TEST_DEVICE_ID);

            const whoamiSpy = simple.stub().callFn(() => Promise.resolve({ user_id: userId, device_id: "wrong" }));
            client.getWhoAmI = whoamiSpy;
            client.uploadDeviceKeys = () => Promise.resolve({});
            client.uploadDeviceOneTimeKeys = () => Promise.resolve({});
            client.checkOneTimeKeyCounts = () => Promise.resolve({});

            await client.crypto.prepare([]);
            expect(whoamiSpy.callCount).toEqual(0);
            expect(client.crypto.clientDeviceId).toEqual(TEST_DEVICE_ID);
        });

        it('should create new keys if any of the properties are missing', async () => {
            const userId = "@alice:example.org";
            const { client } = createTestClient(null, userId, true);

            await client.cryptoStore.setDeviceId(TEST_DEVICE_ID);

            const deviceKeySpy = simple.stub().callFn(() => Promise.resolve({}));
            const otkSpy = simple.stub().callFn(() => Promise.resolve({}));
            client.uploadDeviceKeys = deviceKeySpy;
            client.uploadDeviceOneTimeKeys = otkSpy;
            client.checkOneTimeKeyCounts = () => Promise.resolve({});

            await client.crypto.prepare([]);
            expect(deviceKeySpy.callCount).toEqual(1);
            expect(otkSpy.callCount).toEqual(1);

            // NEXT STAGE: Missing Olm Account

            await client.cryptoStore.setPickledAccount("");
            await client.crypto.prepare([]);
            expect(deviceKeySpy.callCount).toEqual(2);
            expect(otkSpy.callCount).toEqual(2);

            // NEXT STAGE: Missing Pickle

            await client.cryptoStore.setPickleKey("");
            await client.crypto.prepare([]);
            expect(deviceKeySpy.callCount).toEqual(3);
            expect(otkSpy.callCount).toEqual(3);
        });

        it('should use given values if they are all present', async () => {
            const userId = "@alice:example.org";
            const { client } = createTestClient(null, userId, true);

            await client.cryptoStore.setDeviceId(TEST_DEVICE_ID);
            await feedOlmAccount(client);

            const deviceKeySpy = simple.stub().callFn(() => Promise.resolve({}));
            const otkSpy = simple.stub().callFn(() => Promise.resolve({}));
            const checkSpy = simple.stub().callFn(() => Promise.resolve({}));
            client.uploadDeviceKeys = deviceKeySpy;
            client.uploadDeviceOneTimeKeys = otkSpy;
            client.checkOneTimeKeyCounts = checkSpy;

            await client.crypto.prepare([]);
            expect(deviceKeySpy.callCount).toEqual(0);
            expect(otkSpy.callCount).toEqual(1);
            expect(checkSpy.callCount).toEqual(1);
        });
    });

    describe('isRoomEncrypted', () => {
        it('should fail when the crypto has not been prepared', async () => {
            const userId = "@alice:example.org";
            const { client } = createTestClient(null, userId, true);

            await client.cryptoStore.setDeviceId(TEST_DEVICE_ID);
            await feedOlmAccount(client);
            client.uploadDeviceKeys = () => Promise.resolve({});
            client.uploadDeviceOneTimeKeys = () => Promise.resolve({});
            client.checkOneTimeKeyCounts = () => Promise.resolve({});
            // await client.crypto.prepare([]); // deliberately commented

            try {
                await client.crypto.isRoomEncrypted("!new:example.org");

                // noinspection ExceptionCaughtLocallyJS
                throw new Error("Failed to fail");
            } catch (e) {
                expect(e.message).toEqual("End-to-end encryption has not initialized");
            }
        });

        it('should return false for unknown rooms', async () => {
            const userId = "@alice:example.org";
            const { client } = createTestClient(null, userId, true);

            await client.cryptoStore.setDeviceId(TEST_DEVICE_ID);
            await feedOlmAccount(client);
            client.uploadDeviceKeys = () => Promise.resolve({});
            client.uploadDeviceOneTimeKeys = () => Promise.resolve({});
            client.checkOneTimeKeyCounts = () => Promise.resolve({});
            client.getRoomStateEvent = () => Promise.reject("return value not used");
            await client.crypto.prepare([]);

            const result = await client.crypto.isRoomEncrypted("!new:example.org");
            expect(result).toEqual(false);
        });

        it('should return false for unencrypted rooms', async () => {
            const userId = "@alice:example.org";
            const { client } = createTestClient(null, userId, true);

            await client.cryptoStore.setDeviceId(TEST_DEVICE_ID);
            await feedOlmAccount(client);
            client.uploadDeviceKeys = () => Promise.resolve({});
            client.uploadDeviceOneTimeKeys = () => Promise.resolve({});
            client.checkOneTimeKeyCounts = () => Promise.resolve({});
            client.getRoomStateEvent = () => Promise.reject("implying 404");
            await client.crypto.prepare([]);

            const result = await client.crypto.isRoomEncrypted("!new:example.org");
            expect(result).toEqual(false);
        });

        it('should return true for encrypted rooms (redacted state)', async () => {
            const userId = "@alice:example.org";
            const { client } = createTestClient(null, userId, true);

            await client.cryptoStore.setDeviceId(TEST_DEVICE_ID);
            await feedOlmAccount(client);
            client.uploadDeviceKeys = () => Promise.resolve({});
            client.uploadDeviceOneTimeKeys = () => Promise.resolve({});
            client.checkOneTimeKeyCounts = () => Promise.resolve({});
            client.getRoomStateEvent = () => Promise.resolve({});
            await client.crypto.prepare([]);

            const result = await client.crypto.isRoomEncrypted("!new:example.org");
            expect(result).toEqual(true);
        });

        it('should return true for encrypted rooms', async () => {
            const userId = "@alice:example.org";
            const { client } = createTestClient(null, userId, true);

            await client.cryptoStore.setDeviceId(TEST_DEVICE_ID);
            await feedOlmAccount(client);
            client.uploadDeviceOneTimeKeys = () => Promise.resolve({});
            client.checkOneTimeKeyCounts = () => Promise.resolve({});
            client.getRoomStateEvent = () => Promise.resolve({ algorithm: RoomEncryptionAlgorithm.MegolmV1AesSha2 });
            await client.crypto.prepare([]);

            const result = await client.crypto.isRoomEncrypted("!new:example.org");
            expect(result).toEqual(true);
        });
    });

    describe('updateCounts', () => {
        it('should imply zero keys when no known counts are given', async () => {
            const userId = "@alice:example.org";
            const { client } = createTestClient(null, userId, true);

            const expectedUpload = 50;

            await client.cryptoStore.setDeviceId(TEST_DEVICE_ID);
            await feedOlmAccount(client);
            client.uploadDeviceOneTimeKeys = () => Promise.resolve({});
            client.checkOneTimeKeyCounts = () => Promise.resolve({});
            await client.crypto.prepare([]);

            const uploadSpy = simple.stub().callFn((signed) => {
                expect(Object.keys(signed).length).toEqual(expectedUpload);
                return Promise.resolve({});
            });
            client.uploadDeviceOneTimeKeys = uploadSpy;

            await client.crypto.updateCounts({});
            expect(uploadSpy.callCount).toEqual(1);
        });

        it('should create signed OTKs', async () => {
            const userId = "@alice:example.org";
            const { client } = createTestClient(null, userId, true);

            const counts: OTKCounts = { [OTKAlgorithm.Signed]: 0, [OTKAlgorithm.Unsigned]: 5 };
            const expectedUpload = 50;

            await client.cryptoStore.setDeviceId(TEST_DEVICE_ID);
            await feedOlmAccount(client);
            client.uploadDeviceOneTimeKeys = () => Promise.resolve({});
            client.checkOneTimeKeyCounts = () => Promise.resolve({});
            await client.crypto.prepare([]);

            const uploadSpy = simple.stub().callFn((signed) => {
                expect(Object.keys(signed).length).toEqual(expectedUpload);
                expect(Object.keys(signed).every(k => k.startsWith(OTKAlgorithm.Signed + ":"))).toEqual(true);
                return Promise.resolve({});
            });
            client.uploadDeviceOneTimeKeys = uploadSpy;

            await client.crypto.updateCounts(counts);
            expect(uploadSpy.callCount).toEqual(1);
        });

        it('should create the needed amount of OTKs', async () => {
            const userId = "@alice:example.org";
            const { client } = createTestClient(null, userId, true);

            const counts: OTKCounts = { [OTKAlgorithm.Signed]: 0, [OTKAlgorithm.Unsigned]: 5 };
            const expectedUpload = 50;

            await client.cryptoStore.setDeviceId(TEST_DEVICE_ID);
            await feedOlmAccount(client);
            client.uploadDeviceOneTimeKeys = () => Promise.resolve({});
            client.checkOneTimeKeyCounts = () => Promise.resolve({});
            await client.crypto.prepare([]);

            const uploadSpy = simple.stub().callFn((signed) => {
                expect(Object.keys(signed).length).toEqual(expectedUpload);
                expect(Object.keys(signed).every(k => k.startsWith(OTKAlgorithm.Signed + ":"))).toEqual(true);
                return Promise.resolve({});
            });
            client.uploadDeviceOneTimeKeys = uploadSpy;

            await client.crypto.updateCounts(counts);
            expect(uploadSpy.callCount).toEqual(1);

            await client.crypto.updateCounts(counts);
            expect(uploadSpy.callCount).toEqual(2);

            await client.crypto.updateCounts(counts);
            expect(uploadSpy.callCount).toEqual(3);

            await client.crypto.updateCounts(counts);
            expect(uploadSpy.callCount).toEqual(4);
        });

        it('should not create OTKs if there are enough remaining', async () => {
            const userId = "@alice:example.org";
            const { client } = createTestClient(null, userId, true);

            const counts: OTKCounts = { [OTKAlgorithm.Signed]: 14, [OTKAlgorithm.Unsigned]: 5 };
            const expectedUpload = 50 - counts[OTKAlgorithm.Signed];

            await client.cryptoStore.setDeviceId(TEST_DEVICE_ID);
            await feedOlmAccount(client);
            client.uploadDeviceOneTimeKeys = () => Promise.resolve({});
            client.checkOneTimeKeyCounts = () => Promise.resolve({});
            await client.crypto.prepare([]);

            const uploadSpy = simple.stub().callFn((signed) => {
                expect(Object.keys(signed).length).toEqual(expectedUpload);
                expect(Object.keys(signed).every(k => k.startsWith(OTKAlgorithm.Signed + ":"))).toEqual(true);
                return Promise.resolve({});
            });
            client.uploadDeviceOneTimeKeys = uploadSpy;

            await client.crypto.updateCounts(counts);
            expect(uploadSpy.callCount).toEqual(1);
        });

        it('should persist the Olm account after each upload', async () => {
            const userId = "@alice:example.org";
            const { client } = createTestClient(null, userId, true);

            const counts: OTKCounts = { [OTKAlgorithm.Signed]: 0, [OTKAlgorithm.Unsigned]: 5 };
            const expectedUpload = 50;

            await client.cryptoStore.setDeviceId(TEST_DEVICE_ID);
            await feedOlmAccount(client);
            client.uploadDeviceOneTimeKeys = () => Promise.resolve({});
            client.checkOneTimeKeyCounts = () => Promise.resolve({});
            await client.crypto.prepare([]);

            const uploadSpy = simple.stub().callFn((signed) => {
                expect(Object.keys(signed).length).toEqual(expectedUpload);
                expect(Object.keys(signed).every(k => k.startsWith(OTKAlgorithm.Signed + ":"))).toEqual(true);
                return Promise.resolve({});
            });
            client.uploadDeviceOneTimeKeys = uploadSpy;

            let account = await client.cryptoStore.getPickledAccount();

            await client.crypto.updateCounts(counts);
            expect(uploadSpy.callCount).toEqual(1);
            let newAccount = await client.cryptoStore.getPickledAccount();
            expect(account).not.toEqual(newAccount);
            account = newAccount;

            await client.crypto.updateCounts(counts);
            expect(uploadSpy.callCount).toEqual(2);
            newAccount = await client.cryptoStore.getPickledAccount();
            expect(account).not.toEqual(newAccount);
            account = newAccount;

            await client.crypto.updateCounts(counts);
            expect(uploadSpy.callCount).toEqual(3);
            newAccount = await client.cryptoStore.getPickledAccount();
            expect(account).not.toEqual(newAccount);
            account = newAccount;

            await client.crypto.updateCounts(counts);
            expect(uploadSpy.callCount).toEqual(4);
            newAccount = await client.cryptoStore.getPickledAccount();
            expect(account).not.toEqual(newAccount);
        });
    });

    describe('sign', () => {
        // TODO: We should have mutation tests, signing tests, etc to make sure we're calling Olm correctly.
    });
});
