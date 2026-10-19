# Raspored po studentu i prisutnost

U kalendaru otvorite **Filtri → Student**. Admin pregledava sve odobrene upise odabranog studenta; nastavnik samo upise i nastavu svojih kolegija. Student u Mojem rasporedu vidi vlastite odobrene upise. Dostupni su dan, tjedan, mjesec i semestar. Za semestar odaberite i semestar/akademsku godinu u filtrima. Mjesečni pregled prikazuje dane s nastavom. Ispis/PDF, CSV i brojač prate prikazane termine.

## Unos prisutnosti

Otvorite termin nastave i **Evidencija prisutnosti**, ili otvorite tab **Prisutnost na nastavi** i odaberite termin. Prikazuju se studenti s odobrenim upisom za kolegij i akademsku godinu. Mogu se evidentirati i studenti bez računa.

Za svakog studenta odaberite Prisutan, Odsutan ili Opravdano odsutan i kliknite Spremi. Pogrešan unos može se vratiti na Nije evidentirano. Promjene se bilježe u povijesti. Spremanje ponovno provjerava aktualni termin i upis u transakciji, a ovlasti provjeravaju i Firestore pravila.

## Statistika i izvoz

Statistika može biti ukupna po studentu ili razdvojena po studentu i kolegiju. Akademske godine ostaju odvojene. Mogu se kombinirati student, kolegij, godina i datumski raspon; oba krajnja datuma su uključena. Neevidentirani termini (uključujući buduće) nisu izostanci.

Postotak = prisutni / (prisutni + odsutni + opravdano odsutni). Ako nema evidentiranih termina prikazuje se crtica. Nema automatskog određivanja praga za polaganje ili ocjene.

**Izvoz** nudi CSV statistike, ispis/PDF statistike i CSV detaljne evidencije. Izvozi prate odabrane filtre i način grupiranja. Detalji su dostupni i pod Evidencija po terminima.

## Ovlasti i objava

- Admin pregledava i uređuje sve.
- Nastavnik evidentira samo termine na kojima je dodijeljen, uključujući zajedničku nastavu; statistika je ograničena na njegove kolegije.
- Student pregledava i izvozi vlastitu evidenciju, bez uređivanja. Pristup prati trenutačno povezivanje računa s upisom.
- Ostale uloge nemaju pristup ovoj evidenciji.

Podaci su u kolekciji `attendance`, po jednom zapisu za kombinaciju termina i upisa. Modul je uključen u postojeći backup. Promjena nastavnika ne zahtijeva masovno ažuriranje svih zapisa prisutnosti: čitanje se provjerava prema aktualnim dodjelama kolegija.

Prije korištenja na stvarnoj bazi objavite **cijelu aktualnu `firebase/firestore.rules`**, zatim objavite aplikaciju. Nova kolekcija nastaje prvim spremanjem; ne treba je ručno stvarati niti brisati postojeće podatke. Pravila se generiraju naredbom `node scripts/generate-rules.mjs`.
