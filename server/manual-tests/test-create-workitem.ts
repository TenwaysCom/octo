import { PostgresMeegleTokenStore } from "./src/adapters/postgres/meegle-token-store.js";

// Direct API call to see raw response
async function main() {
  const store = new PostgresMeegleTokenStore();
  const tokens = await store.get({
    masterUserId: 'a400632e-8d08-4ddf-977d-e8330b0adc5a',
    meegleUserKey: '7538275242901291040',
    baseUrl: 'https://project.larksuite.com'
  });

  if (!tokens) {
    console.log('No tokens found');
    return;
  }

  // Test 1: Create Issue
  console.log('=== Creating Issue (Raw API) ===');
  const issueResponse = await fetch('https://project.larksuite.com/open_api/4c3fv6/work_item/create', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-PLUGIN-TOKEN': tokens.pluginToken,
      'X-USER-KEY': '7538275242901291040',
      'X-IDEM-UUID': crypto.randomUUID()
    },
    body: JSON.stringify({
      work_item_type_key: 'issue',
      name: '[Test] Production Bug - Raw API Test',
      field_value_pairs: [
        { field_key: 'description', field_value: 'Test bug' }
      ]
    })
  });

  const issueData = await issueResponse.json();
  console.log('Raw response:', JSON.stringify(issueData, null, 2));

  // Test 2: Create Story
  console.log('\n=== Creating Story (Raw API) ===');
  const storyResponse = await fetch('https://project.larksuite.com/open_api/4c3fv6/work_item/create', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-PLUGIN-TOKEN': tokens.pluginToken,
      'X-USER-KEY': '7538275242901291040',
      'X-IDEM-UUID': crypto.randomUUID()
    },
    body: JSON.stringify({
      work_item_type_key: 'story',
      name: '[Test] User Story - Raw API Test',
      field_value_pairs: [
        { field_key: 'description', field_value: 'Test story' }
      ]
    })
  });

  const storyData = await storyResponse.json();
  console.log('Raw response:', JSON.stringify(storyData, null, 2));
}

main().catch(console.error);
