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

Student se registrira istom e-adresom i potvrđuje poveznicu iz Firebase poruke.
Zatim u aplikaciji klikne **Potvrdio/la sam e-adresu**. Već registriran student
može kliknuti **Provjeri upis i pristup** ili se ponovno prijaviti. Automatski se
povezuje samo pripremljena i potvrđena adresa. Ostali računi ostaju neaktivni do
administratorskog odobrenja. Jednom iskorištena priprema ne može ponovno
aktivirati račun koji administrator naknadno deaktivira.

## Firebase

Prije uporabe objaviti **cijeli** `firebase/firestore.rules` u ispravnoj bazi
projekta `par-education` (aplikacija koristi zadanu Firestore bazu). Pravila se
generiraju naredbom `node scripts/generate-rules.mjs`; ne dopisivati odvojene
dozvole u konzoli. Pripremu može kreirati samo aktivni administrator. Vlasništvo
adrese provjerava se kroz Firebase Auth `email_verified`, ne kroz vrijednost
koju korisnik pošalje iz preglednika. Povezivanje profila, dosjea, upisa i
jednokratne pripreme zapisuje se jednom transakcijom.

Email/Password prijava i slanje poruke za potvrdu moraju biti omogućeni u
Firebase Authentication. Cloud Functions i dodatni indeksi nisu potrebni.
Kolekciju `registrationInvites` aplikacija stvara pri prvoj pripremi. Brisanje
podataka ni ponovni uvoz postojećih kolegija nisu potrebni.

Stvarni popisi adresa ne pripadaju javnom repozitoriju. Čuvaju se lokalno i
učitavaju tek u administratorski obrazac. Pripreme nisu dio generičkog backupa
modula; prije čišćenja baze njih zasebno provjeriti u Firebase konzoli.
