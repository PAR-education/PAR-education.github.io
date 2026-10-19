# Raspored po studentu i prisutnost

U kalendaru otvorite **Filtri → Student**. Admin pregledava sve odobrene upise odabranog studenta; nastavnik samo upise i nastavu svojih kolegija. Student u Mojem rasporedu vidi vlastite odobrene upise. Dostupni su dan, tjedan, mjesec i semestar. Za semestar odaberite i semestar/akademsku godinu u filtrima. Mjesečni pregled prikazuje dane s nastavom. Ispis/PDF, CSV i brojač prate prikazane termine.

## Unos prisutnosti

Otvorite termin nastave i **Evidencija prisutnosti**, ili otvorite tab **Prisutnost na nastavi** i odaberite termin. Prikazuju se studenti s odobrenim upisom za kolegij i akademsku godinu. Mogu se evidentirati i studenti bez računa.

U tabu se prvo bira **Kolegij**, a zatim **Termin nastave**. Popis termina do tada je isključen i nakon odabira sadrži samo termine tog kolegija. Kad se evidencija otvori iz rasporeda, oba su odabira već postavljena. Student, način grupiranja, godina i datumski raspon nalaze se pod **Filtri**; Očisti filtre zadržava odabrani kolegij nastavnika. Osvježavanje zadržava odabire.

Nastavnik, admin i AdministracijaPAR za svakog studenta odabiru Prisutan, Odsutan ili Opravdano odsutan i kliknu Spremi. Pogrešan unos može se vratiti na Nije evidentirano. Promjene se bilježe u povijesti. Spremanje ponovno provjerava aktualni termin i upis u transakciji, a ovlasti provjeravaju i Firestore pravila.

## Samoprijava studenta

Student u **Moja prisutnost → Prijava na nastavu** vidi gumb **Prisutan** samo za vlastite odobrene upise tijekom aktualnog termina. Iz detalja termina rasporeda također može otvoriti Moju prisutnost. Prijava počinje točno početkom nastave, a završetkom više nije moguća (početak uključen, završetak isključen). Koristi se Europe/Zagreb, uključujući ljetno i zimsko računanje vremena. Bez upisanog završetka nema samoprijave; nastavnik i ured i dalje mogu voditi evidenciju.

Student može stvoriti samo vlastiti zapis Prisutan. Ne može označiti drugu osobu, upis na čekanju, drugi datum, promijeniti status niti izmijeniti postojeći zapis — čak ni nakon što nastavnik ispravi prisutnost. Nastavnik za svoju nastavu, admin i AdministracijaPAR za svu nastavu mogu naknadno ispraviti status. Takva ispravka ostaje zaključana studentu, uključujući vraćanje na Nije evidentirano.

Vrijeme se provjerava i u Firestore pravilima prema `request.time`; promjena sata računala ili zaobilaženje gumba ne dopušta kasniju prijavu. Gumbi u otvorenom prikazu osvježavaju raspoloživost svakih 15 sekundi. Promjene drugih korisnika dohvaćaju se gumbom Osvježi. Svaki zapis zadržava izvornog autora i vrijeme nastanka; `markedByUid` i `markedByRole` označavaju posljednjeg urednika, a povijest čuva prije/poslije ispravke. Prikaz i detaljni CSV pokazuju je li posljednji unos napravio student, nastavnik ili ured. Stari zapisi ostaju čitljivi bez tih dodatnih polja.

## Statistika i izvoz

Statistika može biti ukupna po studentu ili razdvojena po studentu i kolegiju. Akademske godine ostaju odvojene. Mogu se kombinirati student, kolegij, godina i datumski raspon; oba krajnja datuma su uključena. Neevidentirani termini (uključujući buduće) nisu izostanci.

Postotak = prisutni / (prisutni + odsutni + opravdano odsutni). Ako nema evidentiranih termina prikazuje se crtica. Nema automatskog određivanja praga za polaganje ili ocjene.

**Izvoz** nudi CSV statistike, ispis/PDF statistike i CSV detaljne evidencije. Izvozi prate odabrane filtre i način grupiranja. Detalji su dostupni i pod Evidencija po terminima.

## Ovlasti i objava

- Admin pregledava i uređuje sve.
- Nastavnik evidentira samo termine na kojima je dodijeljen, uključujući zajedničku nastavu; statistika je ograničena na njegove kolegije.
- Student pregledava i izvozi vlastitu evidenciju te potvrđuje samo svoju prisutnost tijekom termina. Pristup prati trenutačno povezivanje računa s upisom.
- AdministracijaPAR pregledava, ispravlja i izvozi cjelokupnu evidenciju. Pristup upisima za popis studenata je samo za čitanje. Ne može arhivirati prisutnost niti odlučivati o upisima.
- Ostale uloge nemaju pristup ovoj evidenciji.

Podaci su u kolekciji `attendance`, po jednom zapisu za kombinaciju termina i upisa. Modul je uključen u postojeći backup. Promjena nastavnika ne zahtijeva masovno ažuriranje svih zapisa prisutnosti: čitanje se provjerava prema aktualnim dodjelama kolegija.

Prije korištenja na stvarnoj bazi objavite **cijelu aktualnu `firebase/firestore.rules`**, zatim objavite aplikaciju. Nova kolekcija nastaje prvim spremanjem; ne treba je ručno stvarati niti brisati postojeće podatke. Pravila se generiraju naredbom `node scripts/generate-rules.mjs`.
