# Control panel, backup i integracija kalendara

## Prije objave

Pushati izmijenjene datoteke, uključujući `assets/vendor/fflate/`. U Firebase Console → Firestore → Rules objaviti **cijeli sadržaj** aktualne `firebase/firestore.rules`. Nova pravila omogućuju aktivnom administratoru vraćanje validiranih zapisa i izvornih datuma kreiranja, uključujući rezervacije i evaluacije. Korisnik i dalje ne može sam dodijeliti ulogu ili aktivirati račun. Administratorski profil ne može deaktivirati sam sebe.

## Potpuni i djelomični export

Administrator u izborniku otvara **Control panel i backup**. Odabire sve ili pojedine module, zatim format i vrstu backupa.

- JSON: strukturirani podaci, identiteti zapisa i manifest backupa.
- CSV: PAR format s manifestom i JSON tipiziranim ćelijama. Čuva brojeve, booleane i vremenske oznake te se može vratiti u PAR aplikaciju.
- ZIP: komprimirani `backup.json` za vraćanje i zasebni, čitljivi CSV izvještaji za svaki odabrani modul. fflate 0.8.3 je spremljen lokalno pod MIT licencom; browser ne treba npm ili build korak.

Nakon preuzimanja provjeriti da je datoteka spremljena i kliknuti **Datoteka je spremljena — potvrdi backup**. Tek tada se mijenja polazište sljedećeg inkrementalnog backupa. Prekid ili pogreška izvoza ne pomiču polazište.

Kopiraju se svi dokumenti odabranih modula, uz paginaciju od 500 zapisa. Ne koristi se limit od 250 zapisa iz običnog prikaza tablica. Najveća datoteka za import je 25 MB; provjera podržava do 50.000 operacija. Za veće baze podijeliti backup po modulima.

## Inkrementalni backup

Za odabrane module prvo mora postojati potvrđen potpuni backup. Sljedeći inkrementalni sadrži nove i promijenjene zapise te ID-eve obrisanih zapisa. Promjene se otkrivaju SHA-256 usporedbom sadržaja; brisanja se otkrivaju usporedbom inventara ID-eva. Modul koji nije odabran ne gubi svoje polazište.

Evidencija polazišta je lokalna za račun, Firebase projekt i preglednik. Drugi preglednik ili brisanje lokalne pohrane zahtijeva novi potpuni backup. Pohranjeni su samo ID-evi i sažeci sadržaja, ne kopije evidencija ili lozinke. Inkrementalna datoteka je manja, ali detekcija promjena ipak čita sve zapise odabranih modula iz Firestorea. To je svjestan kompromis koji pouzdano uključuje brisanja bez Cloud Functions i poslužiteljskog dnevnika promjena.

Izvoz više modula nije jedna atomska snimka baze; napraviti backup kad nema aktivnih izmjena. Čuvati početni potpuni backup i sve sljedeće inkrementalne datoteke.

## Import i vraćanje

Učitati JSON/CSV/ZIP nastao u control panelu. Aplikacija provjerava verziju, SHA-256 sažetak, module, ID-eve, tipove i obavezna polja prije prvog upisa. Sažetak otkriva oštećenje datoteke; nije digitalni potpis autora. Običan CSV iz tabličnog prikaza i pojedinačni CSV izvještaj iz ZIP-a nisu samostalni backupi.

Odabrati sve ili neke module dostupne u učitanoj datoteci, pregledati broj zapisa i potvrditi zamjenu podataka.

- Prema zadanim postavkama zapisi se dodaju ili zamjenjuju prema istom ID-u; ostali zapisi ostaju.
- **Primijeni i brisanja**: inkrementalni backup primjenjuje oznake brisanja; potpuni backup uklanja zapise kojih nema u kopiji odabranih kolekcija. Korisnički profili se ne brišu.
- Inkrementalni se vraća nakon odgovarajućeg početnog/prethodnog backupa. Kod djelomičnog vraćanja lanac se prati zasebno za svaki modul.
- Backup iz drugog Firebase projekta se odbija. Izmišljeni `demo.html` backup ne može se vratiti u produkcijski projekt.
- Postojeći datumi/autor kreiranja ostaju sačuvani; novi zapis dobiva izvorni datum iz backupa. `updatedAt` označava stvarno vrijeme vraćanja.
- Upisi su u blokovima od 200. Pojedini blok je atomski, cijeli veliki import nije. Ako kasniji blok ne uspije, poruka pokazuje koliko je već spremljeno; isti backup može se ponoviti bez dupliciranja ID-eva. Promjena ovlasti ili napuštanje prikaza zaustavljaju preostale blokove.
- Firebase Authentication računi, lozinke, privitci, Storage datoteke i vanjski sustavi nisu dio ove kopije. Vraćanje `users` vraća profile/uloge; ne stvara račune u Authenticationu.

## Google Calendar, Outlook i Apple Calendar

Otvoriti **Integracija kalendara**. Odabrati izvore dostupne svojoj ulozi: raspored, kolegije, ispite, alumni događaje, vlastiti raspored zaposlenika ili godišnje odmore. Za kolegije odabrati tjedan; za događaje bez navedenog završetka odabrati trajanje. Vremenska zona je **Europe/Zagreb**, uključujući ljetno/zimsko vrijeme.

Kliknuti **Prikaži događaje**, pregledati podatke i odabrati događaje. Za jedan događaj **Dodaj u Google kalendar** otvara pripremljeni događaj koji korisnik sprema na Googleovoj stranici. Za više događaja preuzeti `.ics` pa u Google Calendaru otvoriti Postavke → Uvoz i izvoz → Uvoz. Istu datoteku mogu otvoriti Outlook i Apple Calendar.

Ovo je ručni prijenos, prema dogovoru bez OAuth podešavanja. Nema automatske ili dvosmjerne sinkronizacije. Ponovljeni uvoz može stvoriti duplikate; za testiranje koristiti zaseban kalendar. Googleova uputa: https://support.google.com/calendar/answer/37118?hl=hr

## Provjera 14.10.2026.

- 19 unit testova i 15 Firestore testova prolazi.
- JSON, CSV i ZIP round-trip, promjene/brisanja, redoslijed inkrementalnog lanca, oštećene datoteke i scope provjereni.
- Paginated export od 510 Firestore dokumenata provjeren bez gubitka ili duplikata; vlasnički scope očuvan.
- Browser demo: puni JSON od 343 zapisa, inkrementalni ZIP od 0 promjena i djelomični import 10 kolegija.
- Browser + Auth/Firestore emulator: puni JSON, stvarna izmjena događaja, inkrementalni JSON od jedne promjene, vraćanje potpunog i inkrementalnog backupa, CSV export/import svih 22 modula. Vraćeno 7 testnih dokumenata uz očuvanu admin sesiju.
- Preuzeto 10 oglednih događaja u `.ics`; Google Calendar linkovi i Zagreb UTC pomaci provjereni. Vanjski Google račun nije mijenjan.
