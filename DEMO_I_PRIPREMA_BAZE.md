# Privatni demo i priprema baze

## Demo

Aktivni administrator na vrhu radnog prostora ima **Uključi demo**. Žuta traka označava da se prikazuju ogledni podaci iz izvornog predloška. Promjene, uvoz i uređivanje u tom načinu ostaju samo u memoriji te kartice preglednika. Drugi korisnici i kartice nastavljaju raditi sa stvarnom bazom. Izlazak iz demo načina ili osvježavanje stranice odbacuje promjene. Odjava ostaje prava odjava. Opoziv administratorskog pristupa prekida demo pristup.

Stara demo.html preusmjerava na zaštićeni radni prostor. Ogledne datoteke u statičkoj GitHub Pages objavi nisu tajna: sadrže samo postojeći fiktivni predložak. Nemojte u njih dodavati stvarne osobne podatke. Prikaz aplikacije u demo načinu dopušten je samo prijavljenom aktivnom administratoru. Stvarni profil i dalje se prati radi promjena ovlasti; demo evidencije ne zapisuju se na Firebase.

## Prije dolaska stvarnih podataka

**Nemojte obrisati cijelu bazu, kolekciju users ili Firebase Authentication račune.** Objava koda sama ne briše postojeće ogledne zapise.

1. Pushati izmijenjene datoteke i otvoriti objavljenu aplikaciju kao administrator u stvarnom načinu.
2. Otvoriti **Priprema baze / ogledni podaci** → **Pregledaj bazu bez promjena**.
3. Pregledati popis. Alat predlaže samo poznate `template-…` zapise koji odgovaraju izvornom predlošku. Izmijenjene, nepoznate i zapise na koje se pozivaju druge evidencije zadržava. Zapisi bez tog prefiksa također ostaju za ručni pregled.
4. **Preuzmi potpuni backup baze**, provjeriti da je datoteka spremljena. Backup sadrži Firestore podatke i profile, ali ne Authentication lozinke/račune.
5. Označiti samo provjerene ogledne zapise, potvrditi spremljen backup, upisati `OBRISI OGLEDNE` i kliknuti brisanje.
6. Nakon pregleda preostalih podataka uvesti prave podatke kroz njihove module: **Uvezi podatke** (Excel, JSON ili CSV). Demo zatim ostaje dostupan iz lokalnog predloška bez ponovnog punjenja baze.

Brisanje ponovno provjerava sadržaj i poveznice; pojedini zapis briše transakcijski samo ako se nije promijenio. Cijelo čišćenje nije jedna transakcija: kod prekida dio zapisa može već biti uklonjen, a poruka prikazuje broj. Čišćenje raditi prije stvarnog uvoza, bez istodobnog unosa drugih korisnika; nove poveznice između zasebnih transakcija nisu globalno zaključane. Sačuvati backup za povrat kroz Control panel.

Ove promjene ne mijenjaju Firestore pravila. Ako prethodna pravila još nisu objavljena, treba objaviti aktualni firebase/firestore.rules.
