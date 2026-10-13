export function validateRegistration(name, email, password, confirmation) {
  name = name.trim();
  email = email.trim();
  if (!name || name.length > 200)
    throw new Error("Unesite ime i prezime (najviše 200 znakova).");
  if (email.length > 200 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))
    throw new Error("Unesite ispravnu e-adresu.");
  if (password.length < 8)
    throw new Error("Lozinka mora imati najmanje 8 znakova.");
  if (password !== confirmation) throw new Error("Lozinke se ne podudaraju.");
  return { name, email, password };
}
