# Administratorsko testiranje i objava

## Objava

1. Objavite cijeli novi `firebase/firestore.rules` u pravom Firebase projektu. Generiranje: `node scripts/generate-rules.mjs`.
2. Commit/push aplikacije, pričekajte GitHub Pages objavu i osvježite stranicu. Push i produkcijske promjene ovdje nisu izvršeni.
3. Ne brišite postojeće kolekcije ili korisnike. Nova polja su neobavezna za stare zapise; pomoćne kolekcije nastaju korištenjem.
4. Novi računi potvrđuju e-adresu i čekaju adminovo odobrenje. Postojeći računi bez emailVerificationRequired zadržavaju pristup. Provjerite Firebase Authentication predložak e-pošte i odobrene domene svoje produkcijske stranice.

## Pregled kao uloga

Admin uključi **Uključi demo**, zatim u žutoj traci odabere **Pregled kao uloga**. Dostupno je svih šest uloga: administrator, nastavnik, student, alumni, pročelnik i voditelj laboratorija.

Podaci su samo u memoriji kartice. Ovo nisu stvarni korisnički računi niti impersonacija. Prebacivanje uloga zadržava isti skup oglednih podataka: student može poslati novu prijavu, nastavnik je obraditi, a student vidjeti rezultat. Demo student već ima nekoliko upisa; novu prijavu testirajte na drugom kolegiju.

**Vrati početne demo podatke**, osvježavanje i izlazak iz demoa odbacuju testne promjene. Prebacivanje ne piše u Firebase. Oduzimanje prava stvarnom administratoru prekida pristup. Stvarne Firestore ovlasti provjeravaju se zasebnim testnim računima/emulatorom; demo provjerava prikaz i aplikacijsku logiku.

## Dorade

- Osobne kartice i događaji po ulozi; student vidi iznos otvorenih obveza.
- Nastavnici i korisnički računi odabiru se po imenu/e-adresi. Kolegij može imati više nastavnika. Dodjela usklađuje kalendar, upise, ispite, prijave i ocjene bez promjene ocjena/statusa. Prevelike transakcije prekidaju se bez djelomičnog spremanja.
- Modul Dvorane s nazivima i aliasima. Usporedba prepoznaje i Dvorana 1 / Učionica 1.
- Straničenje svih modula; uklonjen stari limit čitanja od 250 zapisa. Izvoz obuhvaća sve filtrirane zapise. Trenutno se straniči prikaz nakon čitanja svih dopuštenih zapisa; vrlo velike baze trebaju poslužiteljsko pretraživanje.
- Admin ima **Kvaliteta podataka**, **Povijest i arhiva** i objedinjeni pregled unutar studentskog dosjea. Glavni CRUD i dodjela kolegija imaju dnevnik. Firebase Console, stari zapisi, povezivanje dosjea i postojeći alati backupa nemaju potpunu povijest. Povrat ne prepisuje zauzeti ID; kalendar ponovno provjerava termin.
- Skupno odobravanje do 50 filtriranih prijava uz pregled i provjeru aktualnog statusa svake stavke. Nije jedna atomska odluka za cijeli popis; prikazuje se rezultat po uspjehu/pogreškama.
- Promjene rasporeda i odluke stvaraju obavijesti u aplikaciji povezanim korisnicima. Dostava je naknadna: neuspjeh obavijesti ne poništava uspješno spremanje i prikazuje upozorenje. E-mail obavijesti nisu povezane.
- Zaključavanje po datumu sprječava istodobno zauzimanje termina kroz novi aplikacijski postupak. Pravila ne provjeravaju matematičke intervale proizvoljnih izravnih SDK upisa; za to treba backend. Veliki backup obnavljajte u dogovorenom terminu održavanja.
- Termin sa seriesId ima **Satnica cijele serije…**: mijenjaju se početak, završetak i dvorana, a datumi/kolegij/nastavnici ostaju isti. Sve se prvo provjerava, a zatim svaka stavka ponovno pri spremanju. Ako nastane sukob, obrada staje s brojem spremljenih termina; nema automatskog vraćanja već spremljenih stavki. Ponovno otvorite seriju za novi pregled.
- Akademska godina na kolegijima/upisima; novi studentski upisi s godinom koriste zaseban ID. Stari upisi bez godine ostaju vidljivi kao dosad. Kvaliteta podataka označava potrebu dopune. Za novi ciklus napravite novo izvođenje kolegija, umjesto prepisivanja povijesti staroga.
- Mobilni kalendar počinje dnevnim prikazom. Prazno razdoblje ima objašnjenje, poništavanje filtara i skok na sljedeći termin.
- HR/EN gumb prevodi osnovne nazive, navigaciju i česte radnje. Nije preveden svaki pomoćni tekst/poruka; izvorni podaci ostaju nepromijenjeni.

## Poslužiteljska faza

Privatne datoteke uz kolegij i zakazani automatski backup nisu aktivirani. Potrebni su Firebase Storage s pravilima za dodijeljene nastavnike/upisane studente te zakazani poslužiteljski posao, servisni račun, zadržavanje kopija i provjera obnove. GitHub Pages i zatvorena kartica to ne mogu pouzdano odrađivati. Privatne datoteke ne zamjenjuju se javnim poveznicama.

## Provjera

- `npm run check`, `npm test`.
- Uz lokalni emulator: `node --test tests/firestore.test.mjs`; ili `npm run test:rules` kada port 8080 nije zauzet. Emulator zahtijeva Java 21+.
- Preglednik: admin demo → student/nastavnik/alumni → povrat na stvarni prikaz; odabir nastavnika i dvorane; arhiva/povrat; promjena termina; studentska prijava i odluka.
- Testovi koriste izmišljene podatke lokalnog emulatora, bez pristupa produkcijskoj bazi.
