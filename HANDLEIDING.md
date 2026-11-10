# Marathontracker – handleiding

Met de Marathontracker houd je je voorbereiding bij op de marathon van **zaterdag 20 maart 2027** (doel: onder 4:00) en de **Marathon Rotterdam op zondag 11 april 2027**.

De app draait in de browser en zet je als app op je telefoon. Hij werkt ook zonder internet. Je gegevens staan altijd eerst op het apparaat zelf. Zodra er verbinding is, gaan ze naar je eigen online opslag (Supabase). Zo zie je op je telefoon en je computer hetzelfde.

Je zet het één keer klaar in vier stappen. Reken op ongeveer 30 minuten. Daarna hoef je er niets meer aan te doen.

---

## Stap 1 – De app online zetten (GitHub, gratis)

1. Ga naar **github.com** en maak een gratis account aan (**Sign up**).
2. Klik rechtsboven op **+** en kies **New repository**.
   - Repository name: `marathontracker`
   - Kies **Public**. Dat is nodig voor gratis hosting. Je trainingsgegevens staan hier niet in; alleen de app zelf.
   - Klik op **Create repository**.
3. Klik op de link **uploading an existing file**.
4. Open op je computer de map `Coderen\marathontracker`. Selecteer **alles wat erin staat**, ook de map `.github`, en sleep het naar het uploadvak. Klik onderaan op **Commit changes**.
5. Ga in je repository naar **Settings → Pages**. Kies bij *Branch* de optie **main** en de map **/ (root)**. Klik op **Save**.
6. Wacht 1–2 minuten en ververs de pagina. Bovenaan staat nu je adres, bijvoorbeeld
   `https://jouwnaam.github.io/marathontracker/`. **Schrijf dit adres op.**

> Is de map `.github` niet meegekomen? Die is alleen nodig om Supabase "wakker" te houden (zie de vragen onderaan). Maak hem dan zelf aan:
> 1. Kies **Add file → Create new file**.
> 2. Typ als naam `.github/workflows/wakker-houden.yml`.
> 3. Plak de inhoud van dat bestand uit je map erin.
> 4. Klik op **Commit changes**.

## Stap 2 – Je gegevensopslag maken (Supabase, gratis)

> **Al grotendeels gedaan.** Het project `marathontracker` (Frankfurt) bestaat al, de tabel staat erin en `config.js` is al ingevuld. Je hoeft alleen nog **punt 4 en 5** hieronder te doen, nadat je in stap 1 je adres hebt gekregen. Open daarvoor het project op **supabase.com/dashboard**.

1. Ga naar **supabase.com** en maak een gratis account aan. Inloggen met je GitHub-account is het makkelijkst.
2. Klik op **New project**.
   - Name: `marathontracker`
   - Database password: kies er een en bewaar het goed. Je hebt het normaal niet meer nodig.
   - Region: **Central EU (Frankfurt)**
   - Klik op **Create new project** en wacht tot het klaar is.
3. Klik links op **SQL Editor**. Open het bestand `supabase-setup.sql` uit je map, kopieer alles en plak het in het venster. Klik op **Run**. Je ziet dan "Success".
4. Klik links op **Authentication → URL Configuration**. Vul bij **Site URL** je adres uit stap 1 in, bijvoorbeeld `https://jouwnaam.github.io/marathontracker/`. Klik op **Save**.
5. Klik op **Authentication → Emails** (of *Email Templates*) en open het sjabloon **Magic Link**. Zet er deze regel bij en sla op:
   `Je inlogcode: {{ .Token }}`
   Je krijgt dan bij het inloggen een code die je in de app intypt.
6. Klik op **Project Settings → API** (soms heet het *Data API* en *API Keys*). Kopieer twee dingen:
   - de **Project URL**, die begint met `https://` en eindigt op `.supabase.co`;
   - de **anon public**-sleutel (soms *publishable key* genoemd).
7. Ga terug naar GitHub. Open in je repository het bestand **config.js** en klik op het potloodje. Vul de twee waarden tussen de aanhalingstekens in:
   ```js
   window.MT_CONFIG = {
     supabaseUrl: 'https://abcdefgh.supabase.co',
     supabaseAnonKey: 'eyJhbGciOi...'
   };
   ```
   Klik op **Commit changes**.

## Stap 3 – Op je Android-telefoon zetten

1. Open je adres uit stap 1 in **Chrome**.
2. Tik rechtsboven op **⋮** en kies **App installeren** (of **Toevoegen aan startscherm**).
3. Open de app vanaf je startscherm.
4. Ga naar **Meer**, vul je e-mailadres in en tik op **Stuur code**.
5. Typ de code uit de e-mail in en tik op **Inloggen**. Tikken op de link in de mail werkt ook.

## Stap 4 – Op je computer

Open hetzelfde adres in je browser en log op dezelfde manier in via **Meer**. Je ziet nu dezelfde gegevens als op je telefoon.

**Laatste stap (aanbevolen):** zet in Supabase bij **Authentication → Sign In / Providers** de optie **Allow new users to sign up** uit. Dan kan niemand anders een account maken op jouw opslag. Jij kunt gewoon blijven inloggen.

---

## Dagelijks gebruik

**Overzicht**
- Hoeveel dagen het nog is tot beide marathons.
- Je week: kilometers, lange loop en sportschool, gepland tegenover gedaan.
- De dagen van de week, met de hartslag waarop je mag lopen.
- Je voorspelde marathontijd.

**Trainingen uit Garmin halen**
1. Ga op de computer naar **connect.garmin.com → Activiteiten → Alle activiteiten**.
2. Scrol naar beneden tot alles geladen is en klik op **Exporteer CSV**.
3. Kies in de app **Garmin importeren** en dan dat bestand.

Trainingen die al in de app staan, worden herkend en overgeslagen. Je kunt dus gerust steeds de hele lijst importeren. Wandelen, fietsen en voetbal worden alleen geïmporteerd als je dat vinkje aanzet.

De app bepaalt zelf het soort training:
- een loop van 18 km of meer wordt een **lange duurloop**;
- een loop op woensdag wordt een **interval**;
- de rest wordt een **rustige duurloop**.

Klopt het soort niet? Tik op de training en pas het aan. Daar vul je ook je **gevoel (1–5)** en een **notitie** in.

**Zelf een training toevoegen**
Tik op **Training toevoegen**. Kies het soort (hardlopen, sportschool of overig) en vul de datum, afstand, tijd en eventueel je hartslag in. Bij sportschool vul je alleen de duur in. Een wedstrijd geef je het type **Wedstrijd**; die telt zwaar mee in de voorspelling.

**Schema**
- Elke week heeft een kleur:
  - **groen**: op koers (90% van de kilometers en de lange loop gehaald);
  - **oranje**: bijna (70% of meer);
  - **rood**: achter.
- Tik op een week voor de dagen en je trainingen. Kies **Week aanpassen** om iets te veranderen.
- **Ziek of een week gemist?** Zet de status op *Ziek* of *Gemist*. Die week telt dan niet mee. Neem in de week erna de doelen over van een week vóór de uitval. Haal de gemiste kilometers niet in.
- **Sportschool** telt mee als het aantal dagen dat je in de sportschool was. Dat staat los van je hardloopkilometers. Een loopbandtraining telt als hardlopen én als sportschooldag.

**Voortgang**
- Grafieken van je kilometers per week, je langste loop per week en je tempo-ontwikkeling.
- Tik op een staaf of punt voor de getallen.
- Onderaan staat waarop de voorspelling is gebaseerd. Daar zie je welke wedstrijden en lange lopen meetellen en hoe zwaar.

**Hoe de voorspelling werkt**
- **Wedstrijden** worden omgerekend naar 42,2 km met de bekende formule van Riegel.
- **Lange lopen** van 18 km of meer uit de laatste 6 weken tellen ook mee, als er een hartslag bij staat. Je tempo wordt omgerekend naar het tempo bij marathon-inspanning: een hartslag van ongeveer 148, op basis van je maximale hartslag van 174 en je rusthartslag van 42.
- Hoe recenter en hoe langer de loop, hoe zwaarder hij meetelt.
- In het begin is de voorspelling vooral gebaseerd op je halve marathon. Die omrekening is aan de voorzichtige kant. Met elke lange loop met hartslag wordt de voorspelling preciezer.

**Back-up**
Ga in **Meer** naar *Back-up en export*. Daar kun je:
- **Back-up downloaden**: hiermee zet je later alles terug;
- **Trainingen voor Excel** en **Schema voor Excel** downloaden.

Op elke export staat "Eigenaar: Daniël Brandwijk" met de datum. Bewaar eens per maand een back-up in je OneDrive.

**Instellingen**
In **Meer** pas je je maximale hartslag, rusthartslag en doeltijd aan.

---

## Vragen

**Hoe vaak moet ik inloggen?**
Eén keer per apparaat. Daarna blijf je ingelogd, ook als je de app een tijd niet gebruikt.

**Hoe vaak moet ik de app gebruiken?**
Zo vaak als je wilt. Een gratis Supabase-project gaat wel "slapen" na 7 dagen zonder gebruik. Daar zijn twee oplossingen voor:
- De taak uit de map `.github` klopt elke 3 dagen automatisch aan, zodat dat niet gebeurt. Krijg je toch een e-mail dat je project gepauzeerd is? Klik dan in Supabase op **Restore project**.
- GitHub zet zo'n automatische taak uit na 60 dagen zonder wijzigingen. Kijk dan bij **Actions** en klik op **Enable workflow**.

Je gegevens raak je nooit kwijt: ze staan ook op je telefoon.

**Wat kost het?**
Niets. GitHub Pages en het gratis abonnement van Supabase zijn ruim genoeg.

**Werkt het zonder internet?**
Ja. Alles wat je invoert, wordt op het apparaat bewaard. Rechtsboven zie je de status:
- **Bijgewerkt**: alles is verstuurd;
- **Offline · 2 wacht**: er wachten nog wijzigingen;
- **Op dit apparaat**: synchronisatie is nog niet ingesteld.

Zodra er weer verbinding is, wordt alles vanzelf verstuurd.

**Kan iemand anders mijn gegevens zien?**
Nee. Alleen wie met jouw e-mailadres inlogt, ziet jouw gegevens. De sleutel in `config.js` is bedoeld om openbaar te zijn en geeft zonder inloggen geen toegang.

**Ik heb een nieuwe versie van de bestanden gekregen.**
Upload ze opnieuw naar GitHub via **Add file → Upload files** en klik op **Commit changes**. Overschrijf daarbij **niet** je ingevulde `config.js`. Sluit de app op je telefoon helemaal af en open hem opnieuw.
