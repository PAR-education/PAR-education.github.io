// Only an inactive, unprivileged profile can be created by the account owner.
export function pendingProfile(user) {
  if (!user?.uid || !user.email)
    throw new Error("Račun nema valjanu e-adresu.");
  const name =
    String(user.displayName || user.email.split("@")[0])
      .trim()
      .slice(0, 200) || "Korisnik";
  return {
    name,
    email: user.email,
    role: "student",
    active: false,
    departmentId: "",
    emailVerificationRequired: true,
    emailVerified: user.emailVerified === true,
  };
}
