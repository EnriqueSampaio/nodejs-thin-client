/*
 * Copyright 2019 GridGain Systems, Inc. and Contributors.
 *
 * Licensed under the GridGain Community Edition License (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     https://www.gridgain.com/products/software/community-edition/gridgain-community-edition-license
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

'use strict';

require('jasmine-expect');

const TestingHelper = require('../TestingHelper');
const IgniteClient = require('@gridgain/thin-client');
const ObjectType = IgniteClient.ObjectType;
const IgniteClientConfiguration = IgniteClient.IgniteClientConfiguration;

const CACHE_NAME = '__test_cache';
const SERVER_NUM = 3;

describe('affinity awareness with checks of connection to cluster test suite >', () => {
    beforeEach((done) => {
        Promise.resolve().
            then(async () => {
                await TestingHelper.initClusterOnly(SERVER_NUM, true);
            }).
            then(done).
            catch(error => done.fail(error));
    }, TestingHelper.TIMEOUT);

    afterEach((done) => {
        Promise.resolve().
            then(async () => {
                await TestingHelper.cleanUp();
            }).
            then(done).
            catch(_error => done());
    }, TestingHelper.TIMEOUT);

    it('client with affinity awareness and bad servers', (done) => {
        Promise.resolve().
            then(async () => {
                const badEndpoints = ['127.0.0.1:10900', '127.0.0.1:10901'];
                const realEndpoints = TestingHelper.getEndpoints(SERVER_NUM);

                for (const ep of realEndpoints)
                    expect(badEndpoints).not.toContain(ep);

                const client = TestingHelper.makeClient();
                const cfg = new IgniteClientConfiguration(...badEndpoints).setConnectionOptions(false, null, true);

                try {
                    await client.connect(cfg);
                }
                catch (error) {
                    expect(error.stack).toContain('Connection failed');

                    return;
                }

                throw 'Connection should be rejected';
            }).
            then(done).
            catch(error => done.fail(error));
    });
    
    // Disabled until this scenario is supported
    xit('cache operation routed to new started node', (done) => {
        Promise.resolve().
            then(async () => {
                const newNodeId = SERVER_NUM + 1;
                const endpoints = TestingHelper.getEndpoints(SERVER_NUM + 1);

                const client = TestingHelper.makeClient();
                const cfg = new IgniteClientConfiguration(...endpoints).setConnectionOptions(false, null, true);
                await client.connect(cfg);

                const cache = (await client.getOrCreateCache(CACHE_NAME)). 
                    setKeyType(ObjectType.PRIMITIVE_TYPE.INTEGER).
                    setValueType(ObjectType.PRIMITIVE_TYPE.INTEGER);

                // Put to inialize partition mapping
                await cache.put(1, 1);
                await TestingHelper.waitMapObtained(client, cache);
                await TestingHelper.getRequestGridIdx('Put');

                // Get to find out the right node
                expect(await cache.get(1)).toEqual(1);

                // Starting new node
                await TestingHelper.startTestServer(true, newNodeId);
                
                // Update partition mapping
                await cache.put(2, 2);
                await TestingHelper.getRequestGridIdx('Put');

                let keys = 1000;
                for (let i = 1; i < keys; ++i) {
                    await cache.put(i * 1433, i);
                    const serverId = await TestingHelper.getRequestGridIdx('Put');

                    // It means request got to the new node.
                    if (serverId == newNodeId)
                        return;
                }

                throw 'Not a single request out of ' + keys + ' got to the new node';
            }).
            then(done).
            catch(error => done.fail(error));
    });
});
