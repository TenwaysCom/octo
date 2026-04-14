async function main() {
  const url = "https://open.larksuite.com/open-apis/bitable/v1/apps/XO0cbnxMIaralRsbBEolboEFgZc/tables/tblUfu71xwdul3NH/records/recv4ngBMiT4u1";
  const token = "u-6soZEm7OJe1p_wL7ARtjLqh5nvf.l5oPqUGafMQ007rY";

  try {
    const res = await fetch(url, {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });
    const data = await res.json();
    console.log("HTTP STATUS:", res.status);
    console.log("RESPONSE:", JSON.stringify(data, null, 2));
  } catch (error) {
    console.error("FETCH ERROR:", error);
  }
}

main();
