Za Erasmus evidencije bez JMBAG-a i računa pogledati [ERASMUS_IMPORT.md](ERASMUS_IMPORT.md). Za tu prilagodbu treba objaviti nova Firestore pravila.

# Excel uvoz i nastavni raspored

## Objava

Pushati sve izmjene, uključujući `assets/vendor/exceljs/` (ExcelJS 4.4.0, MIT). GitHub Pages ne treba build niti npm. U Firebase Console, u projektu `par-education`, objaviti **cijeli sadržaj** aktualnog `firebase/firestore.rules`. Nova pravila dopuštaju nastavniku samo njegovu nastavu na dodijeljenim kolegijima. Stari gumb za uvoz oglednog koda uklonjen je; postojeći zapisi nisu migrirani, brisani ili prepisani.

## Postupak uvoza

U odgovarajućem modulu otvoriti **Uvezi podatke** → **Preuzmi Excel predložak**. List `Podaci` sadrži zaglavlja koja ne treba mijenjati; popunjavanje počinje u retku 2. List `Upute` objašnjava stupce, obavezna polja, formate i ovlasti. `Izbori` daje padajuće liste; za raspored postoji i popis `Kolegiji` s ID-evima i nazivima. Predložak je prazan, primjeri iz uputa ne uvoze se automatski.

Podržani su `.xlsx`, `.json` i UTF-8 `.csv` (zarez ili točka-zarez). Najviše 10 MB, 2000 ulaznih redaka, 5000 proširenih termina. Datumi: `YYYY-MM-DD` ili `DD.MM.YYYY.`; vrijeme `HH:mm`, trajanja su stvarne minute. Excel datumske i vremenske ćelije također se čitaju. ID-evi i JMBAG trebaju biti tekst; brojčani JMBAG odbija se jer su početne nule možda već izgubljene. Formule, spojene ćelije i makronaredbe nisu podržane.

Odabrati **Preskoči postojeće** ili **Ažuriraj postojeće**, učitati datoteku pa kliknuti **Provjeri datoteku**. Pregled pokazuje Excel redak, dodavanje/ažuriranje/preskakanje i razlog greške. Prikazuje prvih 500 rezultata, brojači obuhvaćaju sve. Prije spremanja treba potvrditi pregled. Neispravni retci mogu se izostaviti samo izričitom potvrdom; kod ponavljanja izostavlja se cijela neispravna serija. Nema brisanja zapisa izvan datoteke.

Ponovni uvoz ne stvara iste zapise dvaput. Povezivanje: studenti po JMBAG-u, zatim e-adresi, a ako oboje nedostaje po imenu (jednoznačnost treba provjeriti), zaposlenici po e-mailu, oprema po oznaci, kolegiji po nazivu i semestru, raspored po kolegiju/nazivu, datumu, početku, studiju i grupi. Za ostale module ili promjenu ključnog polja koristiti ID iz detalja postojećeg zapisa. Kod više istih ključeva potreban je ID. Ažuriranje zadržava opcionalne vrijednosti koje nisu navedene u datoteci, uključujući postojeći studentski UID. Obavezna polja i dalje treba ispuniti. Za namjerno brisanje opcionalne vrijednosti koristiti obrazac Uredi.

Uvoz studenta stvara samo evidenciju. Prazan `ownerUid` dopušten je za dosje bez računa; za pristup osobnim podacima administrator naknadno povezuje stvarni Firebase UID. Uvoz `users` upravlja profilima, ne stvara Authentication račune ili lozinke; ID mora biti postojeći/namjenski Authentication UID koji administrator provjeri.

## Ovlasti

| Uloga                 | Moduli za Excel uvoz                                                      |
| --------------------- | ------------------------------------------------------------------------- |
| Administrator         | Svi moduli                                                                |
| Nastavnik             | Vlastita nastava na dodijeljenim kolegijima, vlastiti radni sati i radovi |
| Pročelnik             | EU projekti, vlastiti radni sati i radovi                                 |
| Voditelj laboratorija | Oprema, vlastiti radni sati i radovi                                      |
| Student / alumni      | Bez skupnog uvoza                                                         |

Predložak za nastavnika ne prihvaća stupce kojima bi promijenio svoj UID ili ime. U stvarnoj bazi Firestore dodatno provjerava dodjelu kolegija i vlasništvo. Stari termini bez `instructorUid` ne postaju nastavnikovi samo zato što je njegovo ime u tekstu; njih povezuje administrator uređivanjem zapisa.

## Ponavljanje nastave

Jedan redak sadrži `courseId` (ili jednoznačan naziv), `title`, `date` prvog termina, `time`, `endTime`, `room`, opcionalno `study`, `group`, `academicYear`, `semester`, `teachingType`. Akademska godina, semestar i studij mogu se zadati za cijelu datoteku u prozoru uvoza; pojedini redak može ih nadjačati.

`repeat`: **Jednom**, **Tjedno**, **Svaka dva tjedna**. Za ponavljanje je obavezan `repeatUntil`, najviše 370 dana nakon početka. `exceptions`: datumi odvojeni zarezom, primjer `2026-12-28,2027-01-04`. Sustav generira stvarne datume i oznaku serije. Praznici se ne pretpostavljaju: unesite ih kao iznimke. ID za ponavljajuću seriju ostaje prazan; ID služi za ažuriranje jednog konkretnog termina. Izmjena/brisanje cijele serije jednim klikom nije dio ove verzije.

Provjeravaju se preklapanja dvorane, istog nastavnika i iste grupe unutar istog studija, u datoteci i prema bazi. Nastavnik se veže na dodijeljeni kolegij i prijavljeni račun. Ako nema termina, prikazuje se razlog i nastava/nastavnik s kojim postoji preklapanje. Nepovezani stari zapisi mogu se provjeriti za dvoranu; za provjeru nastavnika/grupe trebaju imati popunjene veze.

## Pregled rasporeda

Povlačenje je dostupno i u tjednom/dnevnom prikazu: zadržava trajanje i dvoranu, a početak se zaokružuje na 15 minuta prema mjestu ispuštanja. U dnevnom popisu/semestarskom pregledu povlačenje na drugi datum zadržava vrijeme. Alt + lijevo/desno mijenja datum, Alt + gore/dolje pomiče početak 15 minuta. Sve koristi iste ovlasti, provjeru kolizija i spremanje kao prikaz dvorana.

Početni pogled je **Tjedan**, s vremenom po visini. Tu su **Dan**, **Semestar / pregled datuma** i **Dvorane i dostupnost**. Na mobitelu se tjedan prikazuje kao dnevni popis. Filtri: studij, grupa, semestar i akademska godina. **Moj raspored** za nastavnika koristi `instructorUid`; za studenta odobrene upise kolegija. Ako kolegij ima više grupa, student odabire svoju grupu. Stari termini bez veza ostaju pod **Sva nastava**. Dvorane zadržavaju provjeru slobodnih termina i ovlašteni drag & drop.

## Ograničenja i provjera

Prije upisa ponovno se provjeravaju podaci i kalendarski konflikti. Upisi su pojedinačni, cijeli import nije atomski. Ako dođe do prekida, poruka navodi koliko je zapisa spremljeno; ponavljanje koristi iste ID-eve. Napuštanje prikaza zaustavlja sljedeće upise. Provjera termina nije globalno zaključavanje istodobnih upisa više nastavnika. Za strogu garanciju rezervacije među paralelnim korisnicima potreban je poslužiteljski raspoređivač/rezervacijski mehanizam.

28 unit/integracijskih testova + 17 Firestore testova prošlo je 15.10.2026. Testovi pokrivaju stvarni XLSX round-trip, CSV, ponavljanja/iznimke, duplikate, očuvanje UID-a/JMBAG-a, vlasništvo, kolizije i zabranu tuđe nastave. U pregledniku su provjereni preuzimanje predloška, uvoz ponavljanja s jednim neispravnim retkom i uvoz studenta bez računa, u oglednoj sesiji bez produkcijskih upisa.

ExcelJS služi za pregledničko čitanje/pisanje i lokalno je spremljen. Npm audit za njegov UUID navodi bounds-check problem u v3/v5/v6 pri prosljeđivanju buffera; aplikacija te funkcije ne poziva niti UUID iz biblioteke koristi za ovlasti ili tokene. ID-evi uvoza temelje se na SHA-256. Pravila za veličinu datoteka i tipove ćelija vrijede i za uvoz u oglednoj sesiji.

## JSON i CSV predlošci

U istom prozoru postoje gumbi za preuzimanje praznih predložaka za sva tri formata. JSON mora biti niz ravnih objekata: svaki objekt je jedan zapis, ključevi su nazivi stupaca iz predloška. Primjer strukture: `[{"title":"Predavanje","date":"2026-10-19","time":"08:00","endTime":"10:00","room":"Dvorana PAR"}]` (ostala obavezna polja ovise o modulu). Koristite predložak svojeg modula za potpuni popis polja. ID/JMBAG su tekst u navodnicima; brojčana i logička polja mogu biti brojevi i true/false. Ugniježđeni objekti i nizovi nisu podržani. Backup JSON ima drugi format i vraća se kroz Control panel.

Sva tri formata prolaze istu provjeru ovlasti, obaveznih polja, ponavljanja i preklapanja rasporeda prije spremanja. Provjeravaju se i međusobni sukobi termina u datoteci. JSON pregled numerira zapise od 1, a Excel/CSV retke od 2 nakon zaglavlja.
