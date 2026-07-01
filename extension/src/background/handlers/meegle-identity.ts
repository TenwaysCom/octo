interface MeegleCookieIdentity {
  userKey: string;
  tenantKey?: string;
}

function getCookie(
  url: string,
  name: string,
): Promise<chrome.cookies.Cookie | null> {
  return new Promise((resolve) => {
    chrome.cookies.get({ url, name }, (cookie) => {
      resolve(cookie ?? null);
    });
  });
}

export async function getMeegleIdentityFromCookies(
  pageUrl: string,
): Promise<MeegleCookieIdentity | undefined> {
  const userCookie = await getCookie(pageUrl, "meego_user_key");

  if (!userCookie?.value) {
    return undefined;
  }

  const tenantCookie = await getCookie(pageUrl, "meego_tenant_key");

  return {
    userKey: userCookie.value,
    tenantKey: tenantCookie?.value,
  };
}
