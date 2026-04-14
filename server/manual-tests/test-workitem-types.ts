import { PostgresMeegleTokenStore } from "./src/adapters/postgres/meegle-token-store.js";
import { MeegleClient } from "./src/adapters/meegle/meegle-client.js";

async function main() {
  const store = new PostgresMeegleTokenStore();
  const tokens = await store.get({
    masterUserId: 'a400632e-8d08-4ddf-977d-e8330b0adc5a',
    meegleUserKey: '7538275242901291040',
    baseUrl: 'https://project.larksuite.com'
  });

  console.log('Tokens found:', {
    hasPluginToken: !!tokens?.pluginToken,
    pluginTokenPrefix: tokens?.pluginToken?.slice(0, 30),
    userKey: tokens?.meegleUserKey
  });

  if (!tokens) {
    console.log('No tokens found');
    return;
  }

  const client = new MeegleClient({
    userToken: tokens.pluginToken,  // 使用pluginToken
    userKey: '7538275242901291040',
    baseUrl: 'https://project.larksuite.com'
  });

  // 获取项目详情和工作项类型
  console.log('\nFetching spaces...');
  const spaces = await client.getSpaces('7538275242901291040');
  console.log('Spaces:', JSON.stringify(spaces, null, 2));

  // 尝试获取workitem meta
  console.log('\nTrying workitem types...');
  const typesToTry = ['bug', 'story', 'issue', 'task', 'production_bug', 'requirement'];

  for (const typeKey of typesToTry) {
    try {
      const meta = await client.getWorkitemMeta('4c3fv6', typeKey);
      console.log(`✓ Type "${typeKey}" exists`);
    } catch (err: any) {
      console.log(`✗ Type "${typeKey}": ${err.message}`);
    }
  }
}

main().catch(console.error);
