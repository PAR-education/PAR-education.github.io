# Erasmus podaci i nepotpune evidencije

Uvoz podržava stvarne podatke bez izmišljenih dopuna:

- Studentski dosje: JMBAG, e-adresa i godina studija mogu se naknadno dopuniti. Status Erasmus označava razmjenu; matično sveučilište, država i semestar razmjene imaju zasebna polja.
- Kolegij: obavezni su naziv i semestar; profesor, ECTS, dvorana i tjedna satnica nisu obavezni. Silabusi podržavaju dulji izvorni tekst. Bez tjedne satnice kolegij se ne izvozi kao izmišljeni Google/ICS termin.
- Upis: obavezan je postojeći studentski UID ili ID dosjea (studentId), uz kolegij i status. Import provjerava postojeće dosjee i kolegije prije upisa. Student ne može vidjeti tuđe/nepovezane upise.
- Raspored: bez dvorane zapis ne rezervira poznatu dvoranu; bez nastavnika nije moguće provjeriti njegovo zauzeće. Sučelje označava nedostatak. Postojeće provjere poznate dvorane, nastavnika i grupe ostaju.

Admin nakon registracije i provjere studentskog računa otvara dosje → Poveži studentski račun i upise. Prihvaća se samo aktivna studentska uloga s istom e-adresom. Povezivanje upisa i dosjea je transakcijsko, kanonski upisi su courseId\_\_UID. Ne mijenja se uloga ili aktivacija korisnika. Ponoviti povezivanje ako su naknadno dodani nepovezani upisi. Za nepoznatu/izmijenjenu e-adresu prvo ručno provjeriti identitet.

Za ovu promjenu treba ponovno objaviti cijeli firebase/firestore.rules. Osobne uvozne datoteke nisu u repozitoriju: pripremljene su u lokalnoj Downloads/PAR-uvoz-2026-2027 mapi s uputama i izvještajem. Nemojte ih commitati ili javno objavljivati.

## Promjena nastavnika kolegija

Spremanje kolegija kroz aplikaciju (ili modulni uvoz) prenosi UID i ime nastavnika na postojeće calendarEvents zapise povezane istim courseId. Vrijedi i kad ponovno spremite isti UID radi usklađivanja ranijih termina. Provjerava se da UID pripada aktivnom korisniku s ulogom profesor. Spremanje kolegija i usklađivanje termina su u jednoj transakciji; datumi, satnica, dvorane i opisi se ne mijenjaju. Brisanje dodjele uklanja UID iz povezanih termina. Za 450 ili više termina operacija se odbija bez promjena. Termini bez courseId ne povezuju se prema nazivu. Postojeći upisi, ispitni rokovi i ocjene nisu predmet ove sinkronizacije.

Izravna izmjena kroz Firebase Console ne pokreće klijentski kod: nakon nje otvorite i spremite kolegij u aplikaciji. Za ovu promjenu ne trebaju nova Firestore pravila.
