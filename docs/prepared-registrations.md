# Priprema studentskih registracija

Administrator otvara **Korisnici i uloge → Pripremi upise** izvan demo načina.
Odabire stvarni kolegij s dodijeljenim nastavnikom i akademskom godinom, učitava
privatni CSV/TXT popis (`name;email`) te pregledava povezivanje dosjea. Neprepoznatu
osobu treba izričito povezati s postojećim dosjeom ili odabrati novi. Za novi dosje
potrebna je stvarna oznaka odjela. Ne treba izmišljati JMBAG ni Authentication UID.

Nakon potvrde sustav dopunjava e-adresu, priprema odobren upis te jednokratnu
pripremu u kolekciji `registrationInvites`. Priprema ne stvara Authentication
račune i ne šalje pozivnice ni lozinke. Ponovno pokretanje iste pripreme ne
duplicira dosjee ni upise. Postojeći upisi zadržavaju ID i povijest prisutnosti.
Za istu adresu podržana je jedna priprema; nakon povezivanja druge kolegije
administrator dodaje uobičajenim putem.

Student se registrira navedenom adresom. Račun ostaje neaktivan dok ga
administrator ne otvori u **Korisnici i uloge** i klikne **Odobri pristup**.
Nema obavezne potvrde e-adrese i poruka za potvrdu ne šalje se pri registraciji.
Nakon odobrenja povezuje se pripremljeni upis (ako student već čeka u aplikaciji,
bez nove prijave). Ostali korisnici također čekaju administratorsko odobrenje.
Iskorištena priprema ne može ponovno aktivirati naknadno deaktiviran račun.

## Firebase

Prije uporabe objaviti **cijeli** `firebase/firestore.rules` u ispravnoj bazi
projekta `par-education` (aplikacija koristi zadanu Firestore bazu). Pravila se
generiraju naredbom `node scripts/generate-rules.mjs`; ne dopisivati odvojene
dozvole u konzoli. Pripremu može kreirati samo aktivni administrator. Povezivanje je dopušteno samo već aktivnom studentskom računu koji je
prethodno odobrio administrator. `email_verified` nije uvjet pristupa; provjeru
identiteta obavlja administrator pri odobravanju. Povezivanje profila, dosjea, upisa i
jednokratne pripreme zapisuje se jednom transakcijom.

Email/Password prijava mora biti omogućena u
Firebase Authentication. Cloud Functions i dodatni indeksi nisu potrebni.
Kolekciju `registrationInvites` aplikacija stvara pri prvoj pripremi. Brisanje
podataka ni ponovni uvoz postojećih kolegija nisu potrebni.

Stvarni popisi adresa ne pripadaju javnom repozitoriju. Čuvaju se lokalno i
učitavaju tek u administratorski obrazac. Pripreme nisu dio generičkog backupa
modula; prije čišćenja baze njih zasebno provjeriti u Firebase konzoli.
