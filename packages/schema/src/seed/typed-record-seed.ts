import type { RecordData } from "../record-types";

/**
 * Dev seed data for every record type but logins (`login-record-seed.ts`),
 * so the type icons, forms, filters and detail views have something to show.
 * Card numbers are the networks' published test numbers; the SSH key was
 * generated for this file and is used nowhere else. Everything is made up.
 */
export const exampleTypedRecords: RecordData[] = [
  {
    type: "card",
    title: "Visa (personal)",
    cardholderName: "Lin Park",
    number: "4111111111111111",
    expiry: "09/29",
    securityCode: "123",
    pin: "4821",
    note: "Daily card. Contactless limit raised to 100 €.",
  },
  {
    type: "card",
    title: "Mastercard (travel)",
    cardholderName: "Lin Park",
    number: "5555555555554444",
    expiry: "03/28",
    securityCode: "456",
    customFields: [{ title: "Hotline", type: "text", value: "+49 69 0000 0000" }],
  },
  {
    type: "card",
    title: "Amex (work)",
    cardholderName: "Lin Park",
    number: "378282246310005",
    expiry: "11/27",
    securityCode: "7890",
  },
  {
    type: "identity",
    title: "Lin Park",
    firstName: "Lin",
    lastName: "Park",
    email: "lin.park@example.com",
    phone: "+49 151 0000 0000",
    birthDate: "1990-04-12",
    street: "Lindenallee 12",
    postalCode: "10115",
    city: "Berlin",
    country: "Germany",
    customFields: [
      { title: "Passport number", type: "secret", value: "C01X00T47" },
      { title: "Tax ID", type: "secret", value: "12 345 678 901" },
    ],
  },
  {
    type: "note",
    title: "Front door code",
    note: "Building: 4711#\nBike cellar: 0815",
  },
  {
    type: "note",
    title: "Crypto wallet seed",
    note: "abandon ability able about above absent absorb abstract absurd abuse access accident",
  },
  {
    type: "ssh_key",
    title: "MacBook Pro (ed25519)",
    publicKey:
      "ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAILx14NGT/Zvo27z1HasC2lsWOBeXJo+zA/DVVNQV/G5T lin@macbook",
    privateKey:
      "-----BEGIN OPENSSH PRIVATE KEY-----\nb3BlbnNzaC1rZXktdjEAAAAABG5vbmUAAAAEbm9uZQAAAAAAAAABAAAAMwAAAAtzc2gtZW\nQyNTUxOQAAACC8deDRk/2b6Nu89R2rAtpbFjgXlyaPswPw1VTUFfxuUwAAAJAlFBFTJRQR\nUwAAAAtzc2gtZWQyNTUxOQAAACC8deDRk/2b6Nu89R2rAtpbFjgXlyaPswPw1VTUFfxuUw\nAAAECx94hkpLB03ihjU5esAdNxEtgA91Y0SxmygXPwekbP5Lx14NGT/Zvo27z1HasC2lsW\nOBeXJo+zA/DVVNQV/G5TAAAAC2xpbkBtYWNib29rAQI=\n-----END OPENSSH PRIVATE KEY-----\n",
    note: "Added to GitHub and the home server.",
  },
  {
    type: "api_key",
    title: "OpenWeather API",
    keyId: "lin-park-dev",
    secret: "b6907d289e10d714a6e88b30761fae22",
    host: "api.openweathermap.org",
  },
  {
    type: "api_key",
    title: "Stripe (test mode)",
    keyId: "pk_test_51ExampleExampleExample",
    secret: "sk_test_51ExampleExampleExampleSecret",
    host: "api.stripe.com",
    note: "Test mode only. Live keys are with finance.",
  },
  {
    type: "wifi",
    title: "Home Wi-Fi",
    ssid: "Park-Home",
    password: "blue-kettle-sunday-42",
    security: "wpa2",
  },
  {
    type: "wifi",
    title: "Office guest",
    ssid: "ACME-Guest",
    password: "welcome2026",
    security: "wpa3",
    hidden: true,
  },
];
