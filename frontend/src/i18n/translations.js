// src/i18n/translations.js
//
// All user-facing copy lives here, one block per language. Components read it
// through the `t('some.key')` helper from ../i18n/LanguageContext.
//
// Dutch is the source language: it is the copy the site was written in, so when
// wording changes, change `nl` first and bring the other two in line.

import { dashboardTranslations } from './dashboardTranslations';
import { invoiceTranslations } from './invoiceTranslations';
import { warehouseFlowTranslations } from './warehouseFlowTranslations';
import { dashboardPageTranslations } from './dashboardPageTranslations';
import { orderOverviewTranslations } from './orderOverviewTranslations';

// The languages a visitor can choose (the flags on the site and in the
// dashboard). Papiamentu is switched off for now: its translations below are
// kept and still maintained, so putting the line back in turns it on again.
export const LANGUAGES = [
  { code: 'nl', label: 'Nederlands', short: 'NL' },
  { code: 'en', label: 'English', short: 'EN' },
  // { code: 'pap', label: 'Papiamentu', short: 'PAP' },
];

export const DEFAULT_LANGUAGE = 'nl';

export const translations = {
  nl: {
    // The "Feedback" button on every page (components/Feedback).
    feedback: {
      button: 'Feedback',
      title: 'Wat vindt u van onze website?',
      intro: 'Geef ons een cijfer en vertel wat beter kan. We lezen alles.',
      starsLabel: 'Uw beoordeling',
      star: '{count} van de 5 sterren',
      comment: 'Uw opmerking (optioneel)',
      commentPlaceholder: 'Wat ging goed, wat kan beter?',
      email: 'Uw e-mailadres (optioneel, als u een antwoord wilt)',
      send: 'Versturen',
      sending: 'Versturen…',
      cancel: 'Annuleren',
      close: 'Sluiten',
      chooseStars: 'Kies eerst 1 tot 5 sterren.',
      failed: 'Het versturen is niet gelukt. Probeer het opnieuw.',
      thanks: 'Bedankt voor uw feedback!',
    },
    // "Factuur bekijken" on a shipment: the invoice and which products
    // reached the warehouse; see orderOverviewTranslations.js.
    orderOverview: orderOverviewTranslations.nl,
    // The office and warehouse dashboards; see dashboardTranslations.js.
    dashboard: {
      ...dashboardTranslations.nl,
      flow: warehouseFlowTranslations.nl,
      // The office's own pages; see dashboardPageTranslations.js.
      pages: dashboardPageTranslations.nl,
      // The invoice editor and its settings page; see invoiceTranslations.js.
      invoice: invoiceTranslations.nl,
    },
    nav: {
      home: 'Home',
      services: 'Diensten',
      tutorial: 'Uitleg',
      tracking: 'Track & Trace',
      booking: 'Boeking',
      calculator: 'Calculator',
      contact: 'Contact',
      label: 'Hoofdnavigatie',
    },
    destinations: {
      label: 'Bestemmingen',
      aruba: 'Aruba',
      bonaire: 'Bonaire',
      curacao: 'Curaçao',
      dominicanRepublic: 'Dominicaanse Republiek',
      saintMartin: 'Sint Maarten',
      suriname: 'Suriname',
      other: 'Overige bestemmingen',
    },
    account: {
      login: 'Inloggen',
      signup: 'Aanmelden',
      logout: 'Uitloggen',
      profile: 'Mijn account',
    },
    notFound: {
      title: 'Pagina niet gevonden',
      body: 'Deze pagina bestaat niet of is verplaatst.',
      home: 'Terug naar home',
    },
    menu: {
      open: 'Menu openen',
      close: 'Menu sluiten',
    },
    language: {
      label: 'Taal',
      choose: 'Kies een taal',
    },
    // The shipping calculator (pages/Calculator). Prices: src/calculator/rates.js.
    calculator: {
      title: 'Verzendkosten berekenen',
      summary:
        'Bereken een indicatie van de verzendkosten naar Curaçao: volume, berekend gewicht, vracht en invoerrechten.',
      intro:
        'Vul in wat u bestelt en hoe groot en zwaar het is. U ziet direct het volume en het berekende gewicht, en - waar de tarieven bekend zijn - een prijsindicatie. Wilt u een prijs op maat? Vraag met één klik een offerte aan met deze gegevens.',
      formTitle: 'Prijsindicatie',
      destination: 'Bestemming',
      price: 'Prijs incl. btw in euro',
      vat: 'Btw-tarief',
      dimensions: 'Afmetingen',
      sides: { lengthCm: 'Lengte', widthCm: 'Breedte', heightCm: 'Hoogte' },
      weight: 'Gewicht',
      grams: 'gram',
      category: 'Invoercategorie',
      chooseCategory: 'Kies een categorie',
      // One label per category in src/calculator/rates.js (same keys, same order).
      categories: {
        clothing: 'Kleding',
        shoes: 'Schoenen',
        bags: 'Tassen, koffers en portemonnees',
        fashionJewellery: 'Bijouterie (geen goud of zilver)',
        preciousJewellery: 'Sieraden van goud of zilver',
        watches: 'Horloges',
        cosmetics: 'Make-up, huid- en haarverzorging',
        perfume: 'Parfum en eau de toilette',
        computers: 'Laptops, computers en tablets',
        phones: 'Mobiele telefoons',
        televisions: 'Televisies en computerschermen',
        headphones: 'Koptelefoons en oordopjes',
        speakers: 'Speakers en versterkers',
        smallAppliances: 'Kleine elektrische apparaten (keuken, föhn, strijkijzer, stofzuiger)',
        furniture: 'Meubels (tafels, kasten, bedden, matrassen)',
        seating: 'Stoelen en banken',
        lighting: 'Lampen',
        homeTextiles: 'Bed-, tafel- en keukenlinnen',
        kitchenware: 'Pannen en keukengerei van staal',
        toys: 'Speelgoed',
        gameConsoles: 'Spelcomputers',
        sports: 'Sportartikelen',
        books: 'Boeken en tijdschriften',
        other: 'Overig',
      },
      transport: 'Transportmethode',
      transports: { air: 'Luchtvracht', sea: 'Zeevracht' },
      submit: 'Bereken',
      result: {
        title: 'Uw indicatie',
        empty: 'Vul het formulier in en druk op Bereken.',
        priceInclVat: 'Prijs incl. btw',
        vat: 'Nederlandse btw ({percent}%)',
        goodsValue: 'Waarde zonder Nederlandse btw',
        volume: 'Volume',
        actual: 'Werkelijk gewicht',
        volumetric: 'Volumegewicht',
        chargeable: 'Berekend gewicht (luchtvracht)',
        freight: 'Vracht ({method})',
        fees: {
          administration: 'Administratiekosten',
          documentation: 'Documentatiekosten',
          handling: 'Handlingkosten',
        },
        duty: 'Invoerrecht ({percent}%)',
        localTax: {
          curacao: 'Omzetbelasting (OB) {percent}%',
        },
        total: 'Totaal (indicatie)',
        notPriced:
          'Voor deze route rekenen we de prijs nog niet automatisch uit. Vraag een offerte aan: u krijgt de prijs van ons, met de gegevens hierboven al ingevuld.',
        partial:
          'Nog niet alle heffingen voor deze bestemming zijn bekend, dus er is nog geen totaal. De bedragen hierboven zijn wat al bekend is.',
        dutyNote:
          'Het invoerrecht komt uit het tarief van invoerrechten van Douane Curaçao. Het precieze percentage hangt af van de goederencode die de douane kiest.',
        disclaimer:
          'Dit is een indicatie, geen offerte. Het definitieve bedrag hangt af van wat wij bij ontvangst in ons magazijn meten en wegen, en van de douane op het eiland.',
      },
      quote: {
        button: 'Offerte aanvragen met deze gegevens',
        intro: 'Prijsindicatie aangevraagd via de calculator:',
      },
      errors: {
        priceInclVat: 'Vul een prijs groter dan 0 in.',
        lengthCm: 'Vul een lengte groter dan 0 in.',
        widthCm: 'Vul een breedte groter dan 0 in.',
        heightCm: 'Vul een hoogte groter dan 0 in.',
        weightGrams: 'Vul een gewicht groter dan 0 in.',
        category: 'Kies een categorie.',
      },
    },
    // The authenticator-app step of signing in (pages/TwoFactor/TwoFactorPage.jsx).
    twoFactor: {
      codeTitle: 'Code uit uw app',
      codeIntro: 'Open uw authenticator-app (bijv. Google of Microsoft Authenticator) en typ de code van zes cijfers voor PayLesShopMore.',
      codeLabel: 'Code',
      backupHint: 'Telefoon kwijt? Typ een van uw herstelcodes.',
      verify: 'Bevestigen',
      checking: 'Controleren…',
      setupTitle: 'Beveilig uw account',
      setupIntro: 'U logt in met uw wachtwoord én een code uit een app op uw telefoon. Zo komt niemand binnen met alleen uw wachtwoord. Dit stelt u één keer in.',
      step1: '1. Installeer een authenticator-app en scan deze QR-code.',
      qrLabel: 'QR-code voor uw authenticator-app',
      cannotScan: 'Lukt scannen niet? Voer deze sleutel in de app in:',
      step2: '2. Typ de code die de app nu toont.',
      codeHint: 'Zes cijfers. De code verandert elke 30 seconden.',
      finishSetup: 'Instellen afronden',
      codesTitle: 'Bewaar uw herstelcodes',
      codesIntro: 'Telefoon kwijt? Met elk van deze codes kunt u één keer inloggen. Ze worden maar één keer getoond: download ze of schrijf ze op en bewaar ze veilig.',
      download: 'Codes downloaden',
      codesFileTitle: 'PayLesShopMore herstelcodes (elk werkt één keer)',
      savedThem: 'Ik heb deze codes veilig bewaard.',
      continue: 'Doorgaan',
      wrongCode: 'Die code klopt niet. Controleer de tijd op uw telefoon en probeer de nieuwste code.',
      locked: 'Te veel verkeerde codes. Wacht 15 minuten en probeer het opnieuw.',
      offline: 'Dat lukt nu niet. Controleer de verbinding en probeer het opnieuw.',
      signOut: 'Uitloggen',
    },
    // "Confirm it's you" before a sensitive admin action (components/ReauthDialog).
    reauth: {
      title: 'Bevestig dat u het bent',
      intro: 'Deze actie is gevoelig. Typ uw wachtwoord opnieuw om door te gaan.',
      password: 'Wachtwoord',
      code: 'Code uit uw authenticator-app',
      confirm: 'Bevestigen',
      checking: 'Controleren…',
      cancel: 'Annuleren',
      wrongPassword: 'Dat wachtwoord klopt niet.',
      wrongCode: 'Die code klopt niet. Probeer de nieuwste code.',
      locked: 'Te veel pogingen. Probeer het later opnieuw.',
      failed: 'Dat lukt nu niet. Probeer het later opnieuw.',
    },
    login: {
      breadcrumb: 'Inloggen',
      title: 'Inloggen',
      subtitle: 'Log in op uw account om uw zendingen te beheren.',
      email: 'E-mailadres',
      password: 'Wachtwoord',
      showPassword: 'Wachtwoord tonen',
      hidePassword: 'Wachtwoord verbergen',
      remember: 'Ingelogd blijven',
      forgot: 'Wachtwoord vergeten?',
      submit: 'Inloggen',
      submitting: 'Bezig met inloggen…',
      noAccount: 'Nog geen account?',
      signupLink: 'Maak er een aan',
      methodLabel: 'Hoe wilt u inloggen?',
      methodPassword: 'Wachtwoord',
      methodCode: 'Magazijncode',
      codeSubtitle:
        'Magazijnmedewerker? Vul uw e-mailadres in en de vierciferige code die een beheerder u per e-mail stuurde.',
      code: 'Code',
      codeHint: 'Vier cijfers, uit de e-mail.',
      errors: {
        emailRequired: 'Vul uw e-mailadres in.',
        emailInvalid: 'Dit e-mailadres lijkt niet te kloppen.',
        passwordRequired: 'Vul uw wachtwoord in.',
        // Deliberately vague: naming which half was wrong tells an attacker
        // whether the address exists.
        failed: 'E-mailadres of wachtwoord is onjuist.',
        offline: 'Inloggen lukt nu niet. Probeer het later opnieuw.',
        tooMany: 'Te veel pogingen. Probeer het over een uur opnieuw.',
        codeRequired: 'Vul de vierciferige code in.',
        codeInvalid: 'De code bestaat uit precies vier cijfers.',
        // Deliberately vague, like `failed`: wrong, expired, used up and
        // not-a-warehouse-account all get this one sentence.
        codeFailed:
          'Deze code werkt niet. Controleer hem, of vraag een beheerder om een nieuwe.',
      },
      // The "Who is working?" screen on a registered floor device, and the
      // page where a worker sets their PIN after an e-mailed code.
      floor: {
        title: 'Wie gaat er werken?',
        subtitle: 'Tik op je naam en typ je pincode.',
        device: 'Apparaat: {name}',
        noWorkers: 'Er staan nog geen magazijnmedewerkers op dit apparaat.',
        locked: 'Geblokkeerd',
        noPin: 'Nog geen pincode',
        pinFor: 'Pincode voor {name}',
        pin: 'Pincode',
        pinHint: 'Vier cijfers.',
        notYou: '← Niet jij?',
        useCode: 'Inloggen met een gemailde code',
        usePassword: 'Kantoor: inloggen met wachtwoord',
        openList: 'Magazijn? Tik op je naam →',
        noPinHelp:
          'Je hebt nog geen pincode. Vraag een beheerder om een inlogcode per e-mail, log daarmee in en kies dan je pincode.',
        lockedHelp:
          'Je pincode is geblokkeerd na te veel foute pogingen. Vraag een beheerder om een inlogcode per e-mail en kies daarna een nieuwe pincode.',
        errors: {
          failed: 'Die pincode klopt niet.',
          coolingOff: 'Te veel foute pincodes op dit apparaat. Wacht een paar minuten.',
        },
      },
      setPin: {
        title: 'Kies je pincode',
        subtitle:
          'Hiermee log je voortaan in op de gedeelde apparaten in het magazijn: tik op je naam en typ vier cijfers.',
        pin: 'Nieuwe pincode',
        repeat: 'Herhaal de pincode',
        hint: 'Vier cijfers. Geen 1234, 0000 of iets dergelijks, en laat niemand meekijken.',
        submit: 'Pincode opslaan',
        saving: 'Opslaan…',
        later: 'Later',
        done: 'Je pincode is opgeslagen.',
        mustChange:
          'Je bent ingelogd met een pincode van je leidinggevende. Kies nu je eigen pincode - pas daarna gaat het magazijn open.',
        notAllowed:
          'Je kunt je pincode alleen instellen direct nadat je bent ingelogd met een gemailde code.',
        errors: {
          invalid: 'Een pincode is precies vier cijfers.',
          mismatch: 'De twee pincodes zijn niet hetzelfde.',
          failed: 'De pincode kon niet worden opgeslagen. Probeer het opnieuw.',
        },
      },
      notImplemented:
        'Inloggen is nog niet gekoppeld: er is nog geen server om de gegevens naartoe te sturen.',
    },
    // The warehouse's own sign-in page (pages/Warehouse/WarehouseLogin.jsx).
    warehouseLogin: {
      title: 'Inloggen magazijn',
      subtitle: 'Log in met je werk-e-mailadres en je pincode.',
      email: 'E-mailadres',
      pin: 'Pincode',
      pinHint: 'Vier cijfers. Laat niemand meekijken.',
      submit: 'Inloggen',
      forgotten: 'Pincode vergeten of geblokkeerd? Vraag je leidinggevende om een nieuwe.',
      office: 'Kantoor of beheer?',
      officeLink: 'Inloggen met wachtwoord',
      signedInAs: 'Je bent al ingelogd als {name}.',
      continueAs: 'Doorgaan naar het magazijn',
      switchToWorker: 'Inloggen als medewerker',
      errors: {
        failed: 'Dat e-mailadres of die pincode klopt niet.',
        tooMany: 'Te veel pogingen. Wacht even en probeer het opnieuw.',
        email: 'Vul je e-mailadres in.',
        pin: 'Een pincode is precies vier cijfers.',
      },
    },
    signup: {
      breadcrumb: 'Aanmelden',
      title: 'Account aanmaken',
      subtitle: 'Maak een account aan om uw zendingen te volgen en te beheren.',
      firstName: 'Voornaam',
      lastName: 'Achternaam',
      phone: 'Telefoonnummer',
      email: 'E-mailadres',
      password: 'Wachtwoord',
      confirm: 'Wachtwoord bevestigen',
      showPassword: 'Wachtwoord tonen',
      hidePassword: 'Wachtwoord verbergen',
      passwordHint: 'Minimaal 12 tekens.',
      strength: {
        label: 'Sterkte van het wachtwoord',
        weak: 'Zwak',
        fair: 'Redelijk',
        good: 'Goed',
        strong: 'Sterk',
      },
      terms: 'Ik ga akkoord met de',
      termsLink: 'algemene voorwaarden',
      and: 'en het',
      privacyLink: 'privacybeleid',
      submit: 'Account aanmaken',
      submitting: 'Bezig met aanmaken…',
      haveAccount: 'Heeft u al een account?',
      loginLink: 'Inloggen',
      errors: {
        firstNameRequired: 'Vul uw voornaam in.',
        lastNameRequired: 'Vul uw achternaam in.',
        phoneRequired: 'Vul uw telefoonnummer in.',
        phoneInvalid: 'Dit telefoonnummer lijkt niet te kloppen.',
        emailRequired: 'Vul uw e-mailadres in.',
        emailInvalid: 'Dit e-mailadres lijkt niet te kloppen.',
        passwordRequired: 'Kies een wachtwoord.',
        passwordShort: 'Uw wachtwoord moet minstens 12 tekens bevatten.',
        confirmMismatch: 'De wachtwoorden komen niet overeen.',
        termsRequired: 'U moet akkoord gaan met de voorwaarden.',
        taken: 'Er bestaat al een account met dit e-mailadres.',
        takenLogin: 'Inloggen met dit e-mailadres',
        passwordWeak:
          'Dit wachtwoord is te makkelijk te raden. Kies er een die minder voor de hand ligt.',
        invalid: 'Controleer de ingevulde gegevens en probeer het opnieuw.',
        offline: 'Aanmelden lukt nu niet. Probeer het later opnieuw.',
        tooMany: 'Te veel pogingen. Probeer het over een uur opnieuw.',
      },
      notImplemented:
        'Aanmelden is nog niet gekoppeld: er is nog geen server om het account aan te maken.',
    },
    passwordReset: {
      requestTitle: 'Wachtwoord vergeten',
      requestSubtitle:
        'Vul uw e-mailadres in. Als er een account bij hoort, sturen wij u een link om een nieuw wachtwoord te kiezen.',
      email: 'E-mailadres',
      requestSubmit: 'Stuur mij een link',
      requestSubmitting: 'Bezig met versturen…',
      // Bewust voorwaardelijk geformuleerd: de server zegt niet of het adres
      // bestaat, en deze pagina mag dat dus ook niet beloven.
      sentBody:
        'Als er een account bij dit e-mailadres hoort, is er een link naar dat adres onderweg.',
      sentNote:
        'De link is een uur geldig. Kijk ook in uw spam- of ongewenste-mailmap.',
      backToLogin: 'Terug naar inloggen',
      chooseTitle: 'Nieuw wachtwoord kiezen',
      chooseSubtitle: 'Kies een nieuw wachtwoord voor uw account.',
      newPassword: 'Nieuw wachtwoord',
      confirm: 'Wachtwoord bevestigen',
      chooseSubmit: 'Wachtwoord opslaan',
      chooseSubmitting: 'Bezig met opslaan…',
      done: 'Uw wachtwoord is gewijzigd. U kunt nu inloggen.',
      deadTitle: 'Deze link werkt niet meer',
      deadBody:
        'Deze link is verlopen of is al gebruikt. Vraag een nieuwe aan om verder te gaan.',
      requestAnother: 'Een nieuwe link aanvragen',
      errors: {
        emailRequired: 'Vul uw e-mailadres in.',
        emailInvalid: 'Dit e-mailadres lijkt niet te kloppen.',
        passwordRequired: 'Kies een wachtwoord.',
        passwordShort: 'Uw wachtwoord moet minstens 12 tekens bevatten.',
        passwordWeak:
          'Dit wachtwoord is te makkelijk te raden. Kies er een die minder voor de hand ligt.',
        confirmMismatch: 'De wachtwoorden komen niet overeen.',
        tooMany: 'Te veel aanvragen. Probeer het over een uur opnieuw.',
        offline: 'Dit lukt nu niet. Probeer het later opnieuw.',
      },
    },
    // Courier tracking: a webshop order on its way to our warehouse
    // (components/CourierTracking, backend/tracking/).
    courier: {
      openLink: "Volgen bij de koerier",
      title: "Koerier volgen",
      unknownCarrier: "Koerier",
      lastLocation: "Laatst bekende locatie",
      expected: "Verwachte bezorging",
      delivered: "Bezorgd op",
      lastUpdated: "Laatst bijgewerkt",
      notKnown: "Nog niet bekend",
      notYet: "Nog niet",
      history: "Updates",
      noEventsYet: "Nog geen updates van de koerier. Die verschijnen meestal binnen een paar uur nadat de winkel uw bestelling verstuurt.",
      manualOnly: "Deze koerier wordt niet automatisch gevolgd. Ons team voegt updates toe zodra we die hebben.",
      sourceCourier: "Koerier",
      sourceUs: "Ons team",
      stageIncoming: "Op weg naar ons magazijn",
      stageOutgoing: "Op weg naar u",
      copy: "Kopiëren",
      copied: "Gekopieerd",
      copyLabel: "Trackingnummer kopiëren",
      testData: "Testgegevens",
      testDataNote: "Dit zijn verzonnen testgegevens, geen echte informatie van de koerier.",
      carrierLabel: "Koeriersbedrijf",
      carrierPlaceholder: "Kies de koerier",
      // The courier list's last choice (server code "other").
      otherCarrier: "Andere koerier",
      carrierHint: "Kies de koerier om uw pakket te volgen op weg naar ons magazijn.",
      problems: {
        delivery_failed: "De koerier kon dit pakket niet bij ons magazijn bezorgen. Kijk op de pagina van de koerier of neem contact op met de winkel.",
        delayed: "De koerier meldt vertraging.",
        returned: "De koerier stuurt dit pakket terug naar de winkel. Neem contact op met de winkel.",
        exception: "De koerier meldt een probleem met dit pakket.",
      },
      status: {
        order_registered: "Bestelling geregistreerd",
        awaiting_arrival: "Wacht op aankomst pakket",
        received_at_warehouse: "Ontvangen in ons magazijn",
        processing_at_warehouse: "In behandeling in ons magazijn",
        ready_for_shipment: "Klaar voor verzending",
        dispatched: "Verzonden",
        in_transit: "Onderweg",
        arrived_at_destination: "Aangekomen in land van bestemming",
        customs: "Douane-afhandeling",
        out_for_delivery: "Wordt bezorgd",
        delivered: "Bezorgd bij ons magazijn",
        delivery_failed: "Bezorgpoging mislukt",
        delayed: "Vertraagd",
        returned: "Retour naar afzender",
        exception: "Probleem met bezorging",
      },
    },
    // Pre-alerts: a parcel on its way to our warehouse (pages/PreAlert, Profile/PreAlerts.jsx).
    prealert: {
      newButton: "Pakket vooraanmelden",
      listTitle: "Onderweg naar ons magazijn",
      loadFailed: "Uw vooraanmeldingen konden niet worden geladen. Probeer het later opnieuw.",
      empty: "Nog geen vooraanmeldingen. Iets besteld? Meld het vooraf aan, dan herkennen wij het als het binnenkomt.",
      dialogTitle: "Vooraanmelding",
      close: "Sluiten",
      statusLabel: "Status",
      back: "Terug",
      title: "Pakket vooraanmelden",
      intro: "Laat ons weten dat er een pakket naar ons magazijn onderweg is. Zo weten wij dat het van u is en verwerken wij het zo snel mogelijk.",
      requiredNote: "Velden met * zijn verplicht.",
      read: {
        title: "Sneller: vul het in met een screenshot",
        text: "Upload een screenshot of PDF van de orderbevestiging of de verzendmail van de webshop. Wij vullen het formulier voor u in; u controleert het daarna.",
        button: "Kies screenshot",
        reading: "Bezig met lezen…",
        done: "Ingevuld uit uw screenshot. Controleer alles voordat u verstuurt.",
        nothing: "We konden niets bruikbaars vinden in dit bestand. Vul het formulier zelf in.",
        failed: "Het bestand kon nu niet worden gelezen. Vul het formulier zelf in.",
      },
      trackingNumber: "Trackingnummer",
      carrier: "Koeriersbedrijf",
      chooseCarrier: "Kies de koerier",
      shop: "Winkel waar u het kocht",
      chooseShop: "Kies de winkel",
      otherShop: "Een andere winkel…",
      shopName: "Naam van de winkel",
      description: "Omschrijving van het pakket",
      descriptionPlaceholder: "Bijvoorbeeld: 1 moederbord en 1 voeding",
      consignee: "Ontvanger",
      value: "Aangegeven waarde",
      invoice: "Factuur",
      invoiceHint: "De factuur of orderbevestiging van de winkel: PDF, JPG, PNG of WebP, maximaal 10 MB per bestand, tot {count} bestanden. Niet verplicht, maar het versnelt de douane.",
      addFile: "Bestand toevoegen",
      removeFile: "Verwijderen",
      noInvoice: "Geen factuur toegevoegd.",
      restrictedBefore: "Ik bevestig dat ik de",
      restrictedLink: "lijst met artikelen die wij niet verzenden",
      restrictedAnd: "en de",
      termsLink: "algemene voorwaarden",
      send: "Vooraanmelding versturen",
      sending: "Versturen…",
      leave: "Annuleren",
      savedTitle: "Vooraanmelding geregistreerd",
      savedText: "Dank u. Uw vooraanmelding {reference} is geregistreerd.",
      savedNext: "Wij volgen uw pakket en laten het u weten zodra het in ons magazijn is. U vindt het onder Mijn zendingen.",
      toShipments: "Naar Mijn zendingen",
      another: "Nog een pakket vooraanmelden",
      inShipment: "In onze zending",
      cancel: "Deze vooraanmelding annuleren",
      cancelConfirm: "Deze vooraanmelding annuleren? Wij verwachten dit pakket dan niet meer.",
      cancelled: "De vooraanmelding is geannuleerd.",
      status: {
        submitted: "Vooraanmelding ontvangen",
        arrived: "Aangekomen in ons magazijn",
        in_shipment: "Toegevoegd aan een zending",
        cancelled: "Geannuleerd",
      },
      errors: {
        failed: "Dat lukte niet. Controleer de verbinding en probeer het opnieuw.",
        trackingNumber: "Vul het trackingnummer in.",
        carrier: "Kies het koeriersbedrijf.",
        shop: "Kies de winkel, of typ de naam.",
        description: "Omschrijf wat er in het pakket zit.",
        consignee: "Vul in wie het pakket ontvangt.",
        restricted: "Bevestig dat u de lijst met artikelen die wij niet verzenden heeft gelezen.",
        fileType: "{name}: alleen een PDF, JPG, PNG of WebP kan worden toegevoegd.",
        fileSize: "{name} is groter dan 10 MB.",
        fileCount: "Maximaal {count} bestanden.",
      },
    },
    tracking: {
      notRegistered: "Dit nummer kennen wij nog niet. Heeft u het van de winkel of koerier gekregen?",
      registerIt: "Meld het pakket hier aan, dan volgt u het tot in ons magazijn.",
      title: 'Volg uw zending',
      // The whole order under the box on the profile page (TrackedOrder.jsx).
      details: {
        booked: "Geboekt op {date} · Boeking {number}",
        loading: "De gegevens van uw zending worden geladen…",
        failed: "De volledige gegevens konden niet worden geladen. Bekijk ze onder Mijn zendingen.",
        ordersTitle: "Uw bestellingen in deze zending",
        courierOrder: "Bestelling: {shop} – {description}",
        inShipment: "Onderdeel van onze zending {number}.",
        onwardTitle: "Zo komt uw zending bij u",
      },
      subtitle: "Vul uw trackingnummer in, of het nummer van de koerier, om alles over uw bestelling te zien.",
      label: 'Trackingnummer',
      placeholder: "Bijvoorbeeld PLSM-1001 of 3SABC1234567",
      submit: 'Zending volgen',
      searching: 'Bezig met zoeken…',
      hint: "Ons trackingnummer staat in de bevestigingsmail; dat van de koerier krijgt u van de winkel.",
      number: 'Trackingnummer',
      destination: 'Bestemming',
      shipped: 'Verscheept op',
      delivered: 'Afgeleverd op',
      expected: 'Verwachte aankomst',
      progress: 'Voortgang van de zending',
      notKnown: 'Nog niet bekend',
      privacyNote:
        'Hier ziet u de status en de bestemming. De volledige gegevens van uw zending vindt u onder Mijn zendingen.',
      locked: {
        title: 'Zending is onderweg',
        body: 'Deze zending is al verstuurd en kan niet meer worden gewijzigd. Nieuwe aankopen worden als aparte zending verstuurd, met een eigen trackingnummer.',
        delivered: 'Deze zending is afgeleverd en kan niet meer worden gewijzigd.',
        cancelled: 'Deze zending is geannuleerd en kan niet meer worden gewijzigd.',
      },
      errors: {
        required: 'Vul een trackingnummer in.',
        notFound:
          'Wij konden in uw account geen zending vinden met dit trackingnummer. Controleer het nummer en probeer het opnieuw.',
        tooMany: 'Te veel zoekopdrachten. Probeer het over een uur opnieuw.',
        offline: 'Zoeken lukt nu niet. Probeer het later opnieuw.',
      },
    },
    booking: {
      // Normal or guided form, and the guided form's steps (pages/Booking/Booking.jsx).
      mode: {
        title: "Hoe wilt u het formulier invullen?",
        normal: "Normaal formulier",
        normalText: "Vul alle gegevens in op één pagina.",
        guided: "Stap voor stap",
        guidedText: "Vul uw boeking stap voor stap in.",
      },
      steps: {
        label: "Stappen van de boeking",
        counter: "Stap {step} van {total}: {name}",
        shipment: "Zending",
        sender: "Afzender",
        recipient: "Ontvanger",
        consignment: "Bestellingen",
        options: "Opties",
        review: "Controleren",
      },
      guided: {
        continue: "Verder",
        back: "Terug",
        edit: "Wijzigen",
        yes: "Ja",
        no: "Nee",
        store: "Winkel",
        name: "Naam",
        optionsTitle: "Extra opties",
        reviewTitle: "Controleer uw boeking",
        reviewText: "Controleer alles hieronder. Met Wijzigen past u een onderdeel aan; wat u al invulde blijft bewaard.",
        recipientHint: "Degene die de zending op het eiland ontvangt: naam, adres en telefoonnummer voor de bezorging.",
      },
      title: 'Boekingsbon',
      lead: 'Vul de boekingsbon hier in plaats van op papier in. Wij vullen het shippingnummer, het volume en het gewicht aan zodra uw zending bij ons is.',
      nav: 'Boeking',
      sections: {
        shipment: 'Zending',
        sender: 'Afzender',
        recipient: 'Ontvanger',
        consignment: 'De zending',
        emigration: 'Emigratie',
        insurance: 'Verzekering en opmerkingen',
        terms: 'Voorwaarden en ondertekening',
      },
      freightLabel: 'Soort vracht',
      freight: { sea: 'Zeevracht', air: 'Luchtvracht' },
      destinationLabel: 'Bestemming',
      destinationOther: 'Overig',
      destinationOtherPlaceholder: 'Welke bestemming?',
      firstName: 'Voornaam',
      lastName: 'Achternaam',
      address: 'Adres',
      postalCode: 'Postcode',
      city: 'Woonplaats',
      phone: 'Telefoonnummer',
      email: 'E-mailadres',
      emailOptional: 'E-mailadres (optioneel)',
      cribOptional: 'Crib-nummer (optioneel)',
      quantity: 'Aantal',
      quantityHint:
        'Weet u nog niet uit hoeveel pakketten uw bestelling bestaat? Laat dit veld dan leeg: wij tellen de pakketten zodra ze bij ons binnen zijn.',
      unit: 'Soort',
      units: { boxes: 'Dozen', pallets: 'Pallets', colli: 'Colli' },
      contents: 'Inhoud',
      contentsAttached: 'Ik stuur de paklijst apart mee',
      // "Uw bestellingen" on the booking form (src/pages/Booking/OrdersField.jsx).
      orders: {
        title: 'Uw bestellingen',
        hint: 'Kies per winkel waar u heeft besteld en vul per product in wat het is en de link. Een screenshot van uw bestelling helpt ons om alles snel te herkennen.',
        store: 'Winkel {number}',
        shop: 'Winkel',
        choose: 'Kies een winkel…',
        other: 'Andere winkel',
        otherName: 'Naam van de winkel',
        description: 'Wat heeft u besteld?',
        descriptionPlaceholder: 'Bijvoorbeeld: laptop en muis',
        screenshot: 'Screenshot van uw bestelling (optioneel)',
        addScreenshot: 'Screenshot toevoegen',
        screenshotFor: 'Screenshot voor winkel {number}',
        removeScreenshot: '{name} verwijderen',
        removeStore: 'Verwijderen',
        add: 'Nog een winkel toevoegen',
        product: 'Product {number}',
        removeProduct: 'Verwijderen',
        removeProductNamed: 'Product {number} verwijderen',
        addProduct: 'Nog een product toevoegen',
        url: 'Link naar het product (optioneel)',
        urlPlaceholder: 'Plak hier de directe link naar uw product.',
        productScreenshot: 'Screenshot van dit product (optioneel)',
        productScreenshotFor: 'Screenshot voor product {product} van winkel {number}',
        wrongType: '{name} kan niet worden toegevoegd: alleen PNG, JPG, WebP of PDF.',
        tooBig: '{name} is groter dan 10 MB.',
        refused: 'Een winkel of screenshot kon niet worden verwerkt. Controleer uw bestellingen en probeer het opnieuw.',
        errors: {
          shop: 'Kies een winkel.',
          shopName: 'Vul de naam van de winkel in.',
          description: 'Vul in wat u heeft besteld.',
          url: 'Plak de volledige link, beginnend met https://',
        },
      },
      value: 'Waarde',
      valueHint:
        'De douane gebruikt dit bedrag om de invoerrechten te berekenen. Vul de werkelijke waarde in.',
      packingLabel: 'Inpakken',
      packing: { sender: 'Door mijzelf', company: 'Door Pay Less Shop More' },
      paymentLabel: 'Betaling',
      payment: { bank: 'Bank', cash: 'Contant' },
      vehicleLabel: 'Indien voertuig',
      vehicle: {
        na: 'Niet van toepassing',
        combustion: 'Benzine/diesel',
        electric: 'Elektrisch/hybride',
      },
      emigration: 'Deze zending hoort bij een emigratie',
      id_present: 'ID aanwezig',
      deregistered: 'Uitgeschreven',
      deregistration_present: 'Uitschrijving aanwezig',
      insured: 'Ik wil de zending verzekeren',
      insuranceInfo: {
        button: 'Hoe werkt de verzekering?',
        text: 'Het premiebedrag bedraagt 1.5% van de goederenwaarde + verschepingskosten met een minimumpremie van €95,00. Het eigen risico bedraagt 1% van de verzekerde waarde met een minimum eigen risico van €250,00 en een maximum eigen risico van €750,00.',
      },
      insuredValue: 'Verzekerde waarde',
      notes: 'Opmerkingen',
      // The clause above the tick box, word for word from the paper form.
      // {company} is filled in by the page with the company name.
      termsClause: {
        important: 'BELANGRIJK!',
        agreeBefore: 'De afzender gaat akkoord met de',
        termsLink: 'algemene voorwaarden',
        liability:
          '{company} is niet verantwoordelijk voor de inhoud en waarde van de colli en kan op geen enkele wijze hiervoor aansprakelijk worden gesteld. De opgegeven waarde zal worden gebruikt door de douane voor berekening van de invoerrechten. U bent zelf verantwoordelijk voor deze waarde en indien de douane het niet eens is met de opgegeven waarde, zullen zij deze herzien. Het is strafbaar verboden items te transporteren.',
        insurance:
          'De afzender gaat ermee akkoord dat de goederen niet verzekerd zijn, tenzij tegen betaling een losse verzekering wordt afgesloten. Glas en geperst houten items altijd uitgesloten.',
      },
      agree: 'Ik ga akkoord met de bovenstaande algemene voorwaarden.',
      signature: 'Ondertekening',
      signatureHint:
        'Typ uw volledige naam. Samen met het vinkje hierboven geldt dit als uw handtekening.',
      submit: 'Boeking versturen',
      sending: 'Bezig met versturen…',
      officeNote:
        'Het shippingnummer, het volume, het gewicht en de controle van de verpakking vullen wij in zodra uw zending bij ons is.',
      done: {
        title: 'Uw boeking is ontvangen',
        body: 'Wij nemen contact met u op zodra wij de zending hebben ingeboekt.',
        reference: 'Uw referentie:',
        home: 'Terug naar de homepage',
        seeBookings: 'Bekijk mijn boekingen',
        signInTip: 'Tip: log de volgende keer eerst in. Dan vindt u uw boeking terug in uw account, onder "Mijn boekingen".',
      },
      errors: {
        required: 'Dit veld is verplicht.',
        email: 'Dit e-mailadres lijkt niet te kloppen.',
        phone: 'Dit telefoonnummer lijkt niet te kloppen.',
        quantity: 'Vul een aantal van minimaal 1 in, of laat het veld leeg.',
        value: 'Vul de waarde van de zending in.',
        contents: 'Beschrijf de inhoud, of geef aan dat u de paklijst apart meestuurt.',
        insuredValue: 'Vul de te verzekeren waarde in.',
        signature: 'Typ uw volledige naam om te ondertekenen.',
        terms: 'U moet akkoord gaan met de voorwaarden.',
        invalid: 'Controleer de ingevulde gegevens.',
        tooMany: 'Te veel aanvragen verstuurd. Probeer het over een uur opnieuw.',
        offline: 'Versturen lukt nu niet. Probeer het later opnieuw.',
      },
    },
    loading: {
      message: 'Bezig met laden…',
      slow: 'Dit duurt langer dan gebruikelijk. Mogelijk is uw verbinding traag.',
      failedTitle: 'Geen verbinding',
      failedBody:
        'We konden de gegevens niet ophalen. Controleer uw internetverbinding en probeer het opnieuw.',
      retry: 'Opnieuw proberen',
      retrying: 'Bezig met opnieuw proberen…',
    },
    profile: {
      title: 'Mijn account',
      subtitle: 'Beheer uw gegevens, adres en voorkeuren.',
      demoNotice:
        'Let op: dit scherm toont voorbeeldgegevens. Er is nog geen server gekoppeld, dus wijzigingen worden niet bewaard.',
      memberSince: 'Klant sinds',
      goToWarehouse: 'Naar het magazijn',
      // "What to do next" banner for customers (pages/Profile/NextSteps.jsx).
      nextSteps: {
        title: 'Wat is de volgende stap?',
        intro: 'Zo verstuurt u uw pakketten via ons, in drie stappen:',
        bookButton: 'Maak een boeking',
        steps: {
          order: { title: 'Bestel in een webshop', text: 'Gebruik ons magazijnadres als factuur- en afleveradres.', link: 'Bekijk het adres' },
          book: { title: 'Maak een boeking', text: 'Vul het boekingsformulier in, zodat wij weten wat er voor u komt en waar het heen moet.' },
          follow: { title: 'Volg uw zending', text: 'Zodra uw pakketten binnen zijn, ziet u ze onder Mijn zendingen.', link: 'Naar mijn zendingen' },
        },
      },
      // A warehouse worker signed in with a password opening the warehouse.
      unlock: {
        title: 'Naar het magazijn',
        intro: 'Vul je e-mailadres en je pincode in om het magazijn te openen.',
        email: 'E-mailadres',
        pin: 'Pincode',
        submit: 'Magazijn openen',
        opening: 'Openen…',
        cancel: 'Annuleren',
        noPinHelp:
          'Je hebt nog geen pincode. Vraag een beheerder om een inlogcode, vul die hieronder in en kies je pincode.',
        lockedHelp:
          'Je pincode is geblokkeerd na te veel foute pogingen. Vraag een beheerder om een inlogcode, vul die hieronder in en kies een nieuwe pincode.',
        setup: {
          code: 'Inlogcode van de beheerder',
          pin: 'Nieuwe pincode',
          repeat: 'Herhaal de pincode',
          hint: 'Vier cijfers. Geen 1234, 0000 of iets dergelijks.',
          submit: 'Pincode opslaan en magazijn openen',
          errors: {
            code: 'De inlogcode is precies vier cijfers.',
            mismatch: 'De twee pincodes zijn niet hetzelfde.',
            codeFailed: 'Die inlogcode werkt niet. Controleer hem, of vraag een beheerder om een nieuwe.',
          },
        },
        errors: {
          email: 'Vul je e-mailadres in.',
          pin: 'Een pincode is precies vier cijfers.',
          failed: 'Dat e-mailadres of die pincode klopt niet.',
          tooMany: 'Te veel pogingen. Wacht even en probeer het opnieuw.',
          offline: 'Het magazijn kan nu niet worden geopend. Probeer het later opnieuw.',
        },
      },
      // The profile's "Two-factor sign-in" card (pages/Profile/TwoFactorCard.jsx).
      twoFactor: {
        preparingAdmin: "Tweestapsverificatie staat nu uit op de site. Stel het hier eerst in op uw eigen account; daarna kunt u het aanzetten op de pagina Beveiliging.",
        preparedAdmin: "Uw account is klaar. U kunt tweestapsverificatie nu aanzetten op de pagina Beveiliging.",
        intro: 'Na uw wachtwoord vraagt de site om een code uit een app op uw telefoon (bijv. Google of Microsoft Authenticator). Zo komt niemand binnen met alleen uw wachtwoord.',
        on: 'Aan',
        off: 'Uit',
        required: 'verplicht voor uw account',
        codesLeft: '{count} herstelcodes over',
        turnOn: 'Aanzetten',
        newCodes: 'Nieuwe herstelcodes',
        turnOff: 'Uitzetten',
        password: 'Uw wachtwoord',
        code: 'Code uit uw app',
        turnOffConfirm: 'Tweestapsverificatie uitzetten',
        newCodesConfirm: 'Nieuwe codes maken',
        cancel: 'Annuleren',
        freshCodes: 'Uw nieuwe herstelcodes. De oude werken niet meer. Bewaar deze veilig; ze worden maar één keer getoond.',
        savedThem: 'Ik heb ze bewaard',
        turnedOff: 'Tweestapsverificatie staat uit. U bent op uw andere apparaten uitgelogd.',
        wrongCode: 'Die code klopt niet. Probeer de nieuwste code uit uw app.',
        wrongPassword: 'Dat wachtwoord klopt niet.',
        locked: 'Te veel verkeerde codes. Wacht 15 minuten en probeer het opnieuw.',
        failed: 'Dat lukt nu niet. Probeer het later opnieuw.',
      },
      // "Your shipping address" (pages/Profile/WarehouseAddressCard.jsx).
      warehouseAddress: {
        title: "Uw verzendadres in Nederland",
        intro: "Bestelt u in een webshop (bol.com, Amazon, Coolblue, IKEA …)? Laat uw bestelling dan naar ons magazijn sturen. Wij ontvangen het pakket en verzenden het naar u.",
        reminderTitle: "Belangrijk:",
        reminder: "gebruik dit adres bij élke bestelling als afleveradres. Vul het precies zo in als hieronder staat. Staat er een ander adres of een andere naam op het pakket, dan weten wij niet dat het van u is.",
        firstName: "Voornaam",
        lastName: "Achternaam",
        street: "Straat en huisnummer",
        postcode: "Postcode",
        city: "Plaats",
        country: "Land",
        firstNameFallback: "Uw voornaam",
        lastNameFallback: "Uw achternaam",
        nameHint: "Vul het precies zo in: uw eigen voornaam bij \"voornaam\" en \"Pay less Shop More\" bij \"achternaam\". Aan uw voornaam herkennen wij uw pakket in het magazijn.",
        copy: "Kopiëren",
        copyAll: "Hele adres kopiëren",
        copiedAll: "Adres gekopieerd!",
        copied: "Gekopieerd.",
        copyFailed: "Kopiëren lukte niet. Selecteer de tekst en kopieer hem zelf.",
        afterTitle: "Na het bestellen",
        after1: "Bewaar de orderbevestiging van de webshop.",
        after2: "Meld het pakket vooraf aan, met de track-and-trace en het koeriersbedrijf.",
        after2Link: "Pakket vooraanmelden",
        after3: "Wij volgen uw pakket tot het in ons magazijn is en laten het u weten zodra het binnen is.",
      },
      sections: {
        details: 'Persoonlijke gegevens',
        warehouseAddress: "Uw verzendadres",
        address: 'Bezorgadres',
        tracking: 'Track & Trace',
        shipments: 'Mijn zendingen',
        bookings: 'Mijn boekingen',
        invoices: 'Mijn facturen',
        password: 'Wachtwoord wijzigen',
        twoFactor: 'Tweestapsverificatie',
        notifications: 'Meldingen',
        danger: 'Account verwijderen',
      },
      fields: {
        name: 'Volledige naam',
        firstName: 'Voornaam',
        lastName: 'Achternaam',
        email: 'E-mailadres',
        phone: 'Telefoonnummer',
        street: 'Straat en huisnummer',
        postalCode: 'Postcode',
        city: 'Plaats',
        country: 'Land of eiland',
        currentPassword: 'Huidig wachtwoord',
        newPassword: 'Nieuw wachtwoord',
        confirmPassword: 'Nieuw wachtwoord bevestigen',
      },
      // "Mijn boekingen" (src/pages/Profile/MyBookings.jsx). The field
      // labels in its pop-up come from booking.* above.
      bookings: {
        handling: 'Handlingkosten',
        products: { link: 'Productlink', copy: 'Link kopiëren', copied: 'Gekopieerd', price: 'Prijs', quantity: 'Aantal', subtotal: 'Subtotaal', total: 'Subtotaal winkel', noLink: 'Geen link opgegeven' },
        intro: 'De boekingen die u heeft verstuurd terwijl u was ingelogd, de nieuwste bovenaan. Klik op een boeking om alles te zien wat u heeft ingevuld. Zodra wij een boeking bevestigen, vindt u hem onder Mijn zendingen.',
        loading: 'Uw boekingen worden geladen…',
        failed: 'Uw boekingen konden niet worden geladen.',
        empty: 'U heeft nog geen boekingen. Een boeking die u verstuurt terwijl u bent ingelogd, verschijnt hier.',
        new: 'Nieuwe boeking',
        title: 'Boeking',
        reference: 'Referentie',
        placedOn: 'Verstuurd op',
        close: 'Sluiten',
        officeHeading: 'Door ons ingevuld',
        shippingNumber: 'Shippingnummer',
        noNumber: 'Nog geen shippingnummer',
        notMeasured: 'Volume en gewicht vullen wij in zodra uw zending bij ons is.',
        // Once the office works on a booking it becomes a shipment, followed under "Mijn zendingen".
        inShipments: 'Te volgen onder Mijn zendingen:',
        name: 'Naam',
        crib: 'Crib-nummer',
        listAttached: 'Paklijst apart meegestuurd',
        notInsured: 'Niet verzekerd',
        yes: 'Ja',
        no: 'Nee',
        orders: 'Uw bestellingen',
        openFile: 'Openen:',
        documents: {
          intro: 'Documenten zoals de orderbevestiging, factuur of track-and-trace kunt u ook later per winkel toevoegen.',
          closed: 'Deze boeking is verzonden of geannuleerd: documenten kunnen niet meer worden gewijzigd.',
          add: 'Document toevoegen',
          kind: 'Soort document',
          chooseKind: 'Kies een soort',
          kinds: {
            order_confirmation: 'Orderbevestiging',
            invoice: 'Factuur',
            order_number: 'Ordernummer (van de webshop)',
            tracking: 'Track-and-trace',
            other: 'Overig',
            screenshot: 'Schermafbeelding',
          },
          file: 'Bestand',
          hint: 'PDF, JPG, PNG of WebP, maximaal 10 MB.',
          upload: 'Uploaden',
          trackingLabel: 'Track-and-trace-code of link',
          trackingPlaceholder: 'Bijv. 3SABC1234567 of https://…',
          trackingHint: 'Kopieer de code of de link uit de verzendmail van de webshop.',
          orderNumberLabel: 'Ordernummer van de webshop (optioneel)',
          orderNumberPlaceholder: 'Bijv. 1234567890',
          orderNumberHint: 'Het ordernummer uit de bevestigingsmail van de webshop. U mag dit leeg laten.',
          addFile: 'Bestand toevoegen',
          replaceFile: 'Bestand vervangen',
          rowAdded: 'Toegevoegd',
          rowMissing: 'Nog niet toegevoegd',
          moreOptions: 'Track & trace, ordernummer of ander bestand',
          done: 'Klaar',
          save: 'Opslaan',
          saving: 'Opslaan…',
          confirmRemoveTracking: 'De track-and-trace verwijderen?',
          uploading: 'Uploaden…',
          cancel: 'Annuleren',
          remove: 'Verwijderen',
          confirmRemove: 'Dit document verwijderen?',
          errors: {
            kind: 'Kies wat voor document dit is.',
            file: 'Kies een bestand.',
            tracking: 'Vul de track-and-trace-code of link in.',
            orderNumber: 'Vul het ordernummer in.',
            failed: 'Het document kon niet worden toegevoegd. Probeer het opnieuw.',
            removeFailed: 'Het document kon niet worden verwijderd. Probeer het opnieuw.',
          },
        },
        valuePending: 'Nog niet ingevuld: wij vullen de waarde in aan de hand van uw screenshots.',
        signedBy: 'Ondertekend door',
        changeNote: 'Klopt er iets niet of wilt u iets wijzigen? Neem dan contact met ons op:',
        status: {
          new: 'Ontvangen',
          confirmed: 'Bevestigd',
          booked_in: 'Ingeboekt',
          shipped: 'Verzonden',
          cancelled: 'Geannuleerd',
        },
      },
      shipments: {
        intro:
          'Elke zending staat hier apart, met een eigen trackingnummer. Zo ziet u meteen welke spullen bij welke zending horen. Koopt u iets nadat een zending al verstuurd is? Dan komt dat op een nieuwe zending te staan.',
        loading: 'Uw zendingen worden geladen…',
        failed: 'Uw zendingen konden niet worden geladen.',
        empty: 'U heeft nog geen zendingen.',
        shipped: 'Verscheept op',
        delivered: 'Afgeleverd op',
        registered: 'Aangemeld op',
        notShippedYet: 'Nog niet verscheept',
        // The one date on a closed shipment bar ("Verwacht 15 okt").
        // Month headings in a group; {month} is e.g. "oktober 2026".
        orderedIn: 'Besteld in {month}',
        // The "comes first" block at the top, and the badge on its bar.
        next: {
          label: 'Komt als eerste aan',
          // Under the title; {date} is e.g. "8 oktober".
          expected: 'Verwacht {date}',
          // The countdown: "nog" / 3 / "dagen", or one word.
          before: 'nog',
          unit: 'dagen',
          today: 'Vandaag',
          tomorrow: 'Morgen',
          badge: 'Volgende',
        },
        bar: {
          expected: 'Verwacht',
          delivered: 'Afgeleverd',
          shipped: 'Verscheept',
          registered: 'Aangemeld',
        },
        // What opens under a shipment (ShipmentDetails.jsx). {date}, {days}
        // and {island} are filled in by the page.
        // Delivery or pickup, in a shipment's pop-up (ShipmentDetails.jsx).
        handover: {
          title: 'Hoe wilt u het ontvangen?',
          delivery: 'Bezorgen',
          pickup: 'Zelf ophalen',
          deliveryNote: 'Onze agent neemt contact met u op om het te bezorgen.',
          pickupNote: 'U haalt het zelf op. Wij laten u weten wanneer het klaarligt.',
          finished: 'Deze zending is afgerond.',
          failed: 'Uw keuze kon niet worden opgeslagen. Probeer het opnieuw.',
          chooseOnce: 'U kunt maar één keer kiezen. Later wijzigen kan alleen per e-mail.',
          confirm: 'Weet u het zeker? U kiest "{choice}". Dit kunt u daarna alleen per e-mail wijzigen.',
          changeByMail: 'Wilt u dit wijzigen? Stuur een e-mail naar',
          mailSubject: 'Ontvangstkeuze wijzigen voor zending',
        },
        details: {
          order: 'Zending',
          photos: "Foto's van uw pakket",
          photo: 'Foto {number}',
          openPhoto: 'Openen:',
          // The photo viewer (components/PhotoGallery).
          gallery: {
            label: '{name} bekijken',
            close: 'Sluiten',
            download: 'Downloaden',
            previous: 'Vorige foto',
            next: 'Volgende foto',
            takenOn: 'gemaakt op {date}',
          },
          measured: 'Gemeten in het magazijn',
          close: 'Sluiten',
          howLong: 'Hoe lang duurt het nog?',
          howLongWas: 'Hoe lang duurde het?',
          arrivalOn: 'Verwachte aankomst: {date}',
          daysLeft: 'Nog ongeveer {days} dagen.',
          tomorrow: 'Morgen verwacht.',
          today: 'Vandaag verwacht.',
          late: 'Het duurt iets langer dan verwacht. Wij laten het u weten zodra uw zending is aangekomen.',
          deliveredOn: 'Afgeleverd op {date}',
          took: 'De reis duurde {days} dagen.',
          notShipped: 'Nog niet verscheept',
          arrived: 'Aangekomen op het eiland',
          arrivedNext: 'Onze agent neemt contact met u op om de aflevering af te spreken.',
          typical: 'Ter indicatie: per zeevracht vaart een zending naar {island} ongeveer {days} dagen; daarna duurt de inklaring circa anderhalve week.',
          journey: 'Waar is uw zending?',
          progress: 'Voortgang van de zending',
          destination: 'Bestemming',
          registered: 'Aangemeld',
          shipped: 'Verscheept',
          delivered: 'Afgeleverd',
          weight: 'Gewicht',
          value: 'Waarde',
          unknown: 'Nog niet bekend',
          notYet: 'Nog niet',
          invoice: 'Factuur',
          noInvoice: 'Er is nog geen factuur voor deze zending.',
        },
        // The steps of the journey timeline, by the server's stage code.
        stages: {
          received: 'Ontvangen in ons magazijn',
          ready_for_shipping: 'Klaar voor verzending',
          in_transit: 'Onderweg',
          arrived: 'Aangekomen op bestemming',
          delivered: 'Afgeleverd',
          // The last step when the customer collects it (handover: pickup).
          picked_up: 'Opgehaald',
        },
        // The three headings the list is split under (Shipments.jsx).
        groups: {
          toSend: 'Nog te verzenden',
          onTheWay: 'Onderweg',
          received: 'Ontvangen',
          cancelled: 'Geannuleerd',
        },
        // The status label on each shipment, by the server's status code.
        status: {
          quoted: 'Offerte verstuurd',
          paid: 'Betaald',
          purchased: 'Producten gekocht',
          ready_for_shipping: 'Klaar voor verzending',
          in_transit: 'Onderweg',
          arrived: 'Aangekomen op bestemming',
          delivered: 'Afgeleverd',
          // A delivered shipment the customer collected themselves.
          picked_up: 'Opgehaald',
          cancelled: 'Geannuleerd',
        },
        locked: {
          title: 'Zending is onderweg',
          titleDelivered: 'Zending is afgeleverd',
          titleCancelled: 'Zending is geannuleerd',
          body: 'Deze zending is al verstuurd en kan niet meer worden gewijzigd. Nieuwe aankopen worden als aparte zending verstuurd, met een eigen trackingnummer.',
          delivered: 'Deze zending is afgeleverd en kan niet meer worden gewijzigd.',
          cancelled: 'Deze zending is geannuleerd en kan niet meer worden gewijzigd.',
        },
      },
      invoices: {
        intro:
          'Van elke betaalde zending maken wij een factuur. Zodra die verstuurd is, staat hij hier klaar als pdf.',
        loading: 'Uw facturen worden geladen…',
        empty: 'U heeft nog geen facturen. Zij verschijnen hier zodra een zending betaald en verwerkt is.',
        failed: 'Uw facturen konden niet worden geladen.',
        retry: 'Opnieuw proberen',
        tracking: 'Zending',
        download: 'Download pdf',
      },
      notifications: {
        shipping: 'Updates over mijn zendingen',
      },
      dangerText:
        'Het verwijderen van uw account is definitief. Al uw gegevens en zendingsgeschiedenis gaan verloren.',
      deleteAccount: 'Account verwijderen',
      deleteConfirm: 'Weet u het zeker? Deze actie kan niet ongedaan worden gemaakt.',
      deletePasswordLabel: 'Bevestig met uw wachtwoord',
      deleteAnonymised:
        'Uw persoonsgegevens zijn verwijderd. Uw zendingsgegevens blijven bewaard omdat wij die wettelijk moeten bewaren.',
      deleteDone: 'Uw account is verwijderd.',
      deleteCancel: 'Annuleren',
      deleteYes: 'Ja, verwijder mijn account',
      save: 'Opslaan',
      saving: 'Bezig met opslaan…',
      saved: 'Uw wijzigingen zijn opgeslagen.',
      errors: {
        nameRequired: 'Vul uw naam in.',
        firstNameRequired: 'Vul uw voornaam in.',
        lastNameRequired: 'Vul uw achternaam in.',
        emailRequired: 'Vul uw e-mailadres in.',
        emailInvalid: 'Dit e-mailadres lijkt niet te kloppen.',
        currentRequired: 'Vul uw huidige wachtwoord in.',
        passwordShort: 'Uw nieuwe wachtwoord moet minstens 12 tekens bevatten.',
        confirmMismatch: 'De wachtwoorden komen niet overeen.',
        offline: 'Opslaan lukt nu niet. Probeer het later opnieuw.',
      },
      notImplemented:
        'Opslaan is nog niet gekoppeld: er is nog geen server om de wijzigingen naartoe te sturen.',
    },
    destination: {
      // The "Overige bestemmingen" page: everywhere we ship that has no page
      // of its own. See pages/Destinations/OtherDestinations.jsx.
      otherTitle: 'Overige bestemmingen',
      otherLead:
        'Wij verzenden ook naar de landen hieronder. Deze bestemmingen hebben geen eigen pagina, maar wij regelen uw zending er net zo goed naartoe — vraag ons naar de mogelijkheden en de kosten.',
      otherCta: 'Vraag naar deze bestemming',
      eyebrow: 'Van bestelling tot voordeur',
      step: 'Stap',
      howTitle: 'Zo komt uw bestelling op {island}',
      howSubtitle:
        'U koopt zelf in, wij verzorgen de verzending. Twee stappen liggen bij u, twee bij ons.',
      indexTitle: 'Onze bestemmingen',
      indexSubtitle:
        'Wij varen op vijf bestemmingen. Kies er een om te zien hoe lang de reis duurt en wat u kunt verwachten.',
      indexTransit: 'Vaartijd',
      indexArrives: 'Aankomst in',
      indexDays: '{days} dagen',
      indexMore: 'Bekijk deze bestemming',
      who: {
        you: 'U doet dit',
        us: 'Wij doen dit',
      },
      facts: {
        transit: 'Vaartijd',
        transitValue: 'ongeveer {days} dagen',
        arrives: 'Aankomst in',
        vat: 'Prijzen',
        vatValue: 'Zonder Nederlandse btw',
        handover: 'Aflevering',
        handoverValue: 'Onze agent neemt contact op',
      },
      stages: {
        quote: {
          title: 'Vraag een offerte aan',
          body: 'Laat ons weten wat u wilt versturen. U ontvangt van ons een indicatieve offerte voor de verzending naar {island}.',
        },
        purchase: {
          title: 'U koopt zelf in',
          body: 'U bestelt en betaalt uw aankopen zelf en laat ze afleveren op ons magazijnadres in Nederland. Meld de zending daarna bij ons aan met de boekingsbon.',
        },
        ship: {
          title: 'Wij verschepen',
          body: 'Wij ontvangen uw pakketten, meten en wegen ze en versturen ze per zeevracht of luchtvracht naar {island}.',
        },
        deliver: {
          title: 'Wij klaren in en leveren af',
          body: 'Wij verzorgen de inklaring op {island}. Zodra uw zending gereed is, neemt onze agent contact met u op voor de aflevering.',
        },
      },
      faq: {
        title: 'Veelgestelde vragen over {island}',
        more: 'Staat uw vraag er niet bij?',
        contact: 'Stel hem gerust',
        what: {
          q: 'Wat kan ik laten verzenden?',
          a: 'Vrijwel alles: kleding, elektronica, huishoudelijke apparaten, gereedschap en meubels. Gevaarlijke stoffen, verse levensmiddelen en losse accu’s kunnen niet mee.',
        },
        cost: {
          q: 'Waar hangt de prijs van af?',
          a: 'Van het gewicht en het volume van uw zending, en van de verzendwijze: zeevracht of luchtvracht. Onze offerte is altijd indicatief; het definitieve bedrag hangt af van wat wij bij ontvangst in ons magazijn meten en wegen.',
        },
        time: {
          q: 'Hoe lang duurt het?',
          a: 'Per zeevracht is de vaartijd naar {port} ongeveer {days} dagen; daarna duurt de inklaring circa anderhalve week. Per luchtvracht gaat het sneller: lever uiterlijk donderdag 12:00 aan, dan vliegt uw zending in het weekend en duurt de inklaring circa 3–4 dagen.',
        },
        customs: {
          q: 'Moet ik zelf iets met de douane regelen?',
          a: 'Nee. Wij maken de documenten in orde en handelen de douane af. Invoerrechten op de bestemming staan daar los van; uw offerte geeft er een indicatie van.',
        },
        oversize: {
          q: 'En spullen van groot formaat?',
          a: 'Die kunnen mee. Wij kijken per geval wat de beste verschepingswijze is. Vermeld de afmetingen in uw aanvraag.',
        },
      },
      quote: {
        title: 'Offerte aanvragen',
        intro:
          'Laat ons weten wat u wilt versturen, dan rekenen wij uit wat de verzending naar u toe kost. Onze offertes zijn altijd indicatief.',
        forIsland: 'Offerte voor',
        optional: '(optioneel)',
        orDrop: 'of sleep het hierheen',
        filesNote:
          'Eén bestand per aanvraag. Heeft u er meer, of juist geen? Beschrijf het in het berichtenveld hieronder, of mail de rest naar',
        requiredNote: 'Velden met * zijn verplicht.',
        firstName: 'Voornaam',
        lastName: 'Achternaam',
        email: 'E-mailadres',
        // The upload is meant for the webshop invoice of what is being sent.
        upload: 'Uw factuur',
        // The "Hoe werkt dit?" pop-up above the form (HelpDialog). Each line
        // of `steps` becomes one numbered step in the pop-up.
        help: {
          open: 'Hoe werkt dit formulier?',
          title: 'Zo vraagt u een offerte aan',
          steps: [
            'Vul uw voornaam, achternaam en e-mailadres in. Op dat e-mailadres sturen wij u de offerte.',
            'Upload de factuur van uw bestelling bij "Uw factuur": klik op "Kies een bestand" of sleep het bestand in het vak. Een PDF, foto of screenshot (JPG of PNG) van maximaal 10 MB is goed.',
            'Nog geen factuur, of meer dan één? Beschrijf in het berichtenveld wat u wilt versturen, of mail de overige facturen naar info@paylesshopmore.com.',
            'Klik op "Aanvraag versturen". U ontvangt zo snel mogelijk een indicatieve offerte per e-mail.',
          ],
          done: 'Begrepen',
          close: 'Sluiten',
        },
        uploadHint: 'PDF, JPG of PNG, maximaal 10 MB.',
        chooseFile: 'Kies een bestand',
        noFile: 'Geen bestand gekozen',
        removeFile: 'Bestand verwijderen',
        message: 'Uw bericht',
        messagePlaceholder:
          'Beschrijf wat u wilt versturen, of laat ons weten waar wij op moeten letten.',
        send: 'Aanvraag versturen',
        sending: 'Bezig met versturen…',
        errors: {
          firstNameRequired: 'Vul uw voornaam in.',
          lastNameRequired: 'Vul uw achternaam in.',
          emailRequired: 'Vul uw e-mailadres in.',
          emailInvalid: 'Dit e-mailadres lijkt niet te kloppen.',
          fileTooLarge: 'Dit bestand is groter dan 10 MB.',
          fileType: 'Kies een PDF-, JPG- of PNG-bestand.',
          invalid: 'Controleer de ingevulde gegevens.',
          tooMany: 'Te veel aanvragen verstuurd. Probeer het over een uur opnieuw.',
        },
        sent: 'Bedankt! Uw aanvraag is verstuurd — u ontvangt zo snel mogelijk een indicatieve offerte.',
        notImplemented:
          'Het offerteformulier is nog niet gekoppeld: er is nog geen server om de aanvraag naartoe te sturen.',
      },
    },
    home: {
      hero: {
        eyebrow: 'Btw-vrij van Nederland naar Aruba, Bonaire en Curaçao',
        title: 'Bestel in Nederland. Wij bezorgen het btw-vrij op het eiland.',
        lead: 'Koop bij elke Nederlandse webshop en laat het naar ons magazijn in Nederland sturen. Uw bestellingen, eenvoudig geregeld. Wij bundelen en verschepen ze btw-vrij per boot of vliegtuig en bezorgen ze vervolgens bij u thuis op Aruba, Bonaire of Curaçao.',
        trackCta: 'Zending volgen',
        startCta: 'Aan de slag',
        howCta: 'Hoe het werkt',
        myShipments: 'Mijn zendingen',
        points: {
          shop: {
            title: 'U bestelt',
            body: 'Bij elke Nederlandse webshop, met ons adres als afleveradres.',
          },
          ship: {
            title: 'Wij verschepen',
            body: 'We bundelen uw pakketten en versturen ze btw-vrij per zeevracht of luchtvracht.',
          },
          deliver: {
            title: 'U ontvangt',
            body: 'Onze agent op het eiland zorgt ervoor dat uw bestelling gemakkelijk bij u thuis of op het werk wordt bezorgd.',
          },
        },
      },
      shops: {
        title: 'BESTEL BIJ JOUW FAVORIETE WINKELS',
        visit: 'Bekijk winkel',
        cta: 'Bekijk alle winkels',
      },
      stats: {
        title: 'Onze cijfers',
        loading: 'Cijfers laden…',
        delivered: 'Pakketten afgeleverd',
        destinations: 'Bestemmingen bediend',
        customers: 'Klanten',
        tracking: 'Zendingen volgen',
      },
      map: {
        eyebrow: 'Onze routes',
        title: 'Van Nederland naar de eilanden',
        lead: 'Beweeg over een bestemming om de route en de vaartijd te zien.',
        origin: 'Nederland',
        hint: 'Kies een bestemming op de kaart om de route te bekijken.',
        sea: 'Zeevracht',
        seaDays: '{days} dagen vaartijd',
        seaClearance: 'Inklaring circa anderhalve week',
        air: 'Luchtvracht',
        // The latest moment to hand a shipment in, and when it flies. Which
        // of these an island has is listed in src/data/destinations.js.
        flights: {
          thursdayWeekend: 'Uiterste aanlevertijd donderdag 12:00 — vliegt in het weekend',
          mondayThursday: 'Uiterste aanlevertijd maandag en donderdag vóór 12:00 uur',
        },
        airClearance: 'Transit en inklaring circa 3–4 dagen',
        more: 'Bekijk deze bestemming',
      },
      services: {
        eyebrow: 'Wat wij doen',
        title: 'Alles voor uw zending',
        lead: 'Van het bestellen bij een webshop tot de aflevering op het eiland.',
        learnMore: 'Lees meer',
        shopAndShip: {
          title: 'Shop & ship',
          body: 'Bestel bij Nederlandse webshops en laat alles op ons adres bezorgen. Wij regelen de rest.',
        },
        consolidation: {
          title: 'Samenvoegen',
          body: 'Meerdere bestellingen bundelen wij tot één zending, zodat u maar één keer verzendkosten betaalt.',
        },
        doorToDoor: {
          title: 'Tot aan de deur',
          body: 'Onze agent op de bestemming neemt contact op en regelt de aflevering bij u thuis.',
        },
        customs: {
          title: 'Douane en papieren',
          body: 'Wij verzorgen de documenten en de douaneafhandeling, zodat uw zending niet blijft staan.',
        },
        tracking: {
          title: 'Track & trace',
          body: 'Volg uw zendingen in uw account, van vertrek tot aflevering.',
        },
        business: {
          title: 'Zakelijk verzenden',
          body: 'Verzendt u regelmatig naar de eilanden? Neem contact op voor afspraken op maat.',
        },
      },
      journey: {
        eyebrow: 'Van bestelling tot deur',
        title: 'Wat er met uw zending gebeurt',
        lead: 'Elke zending doorloopt dezelfde stappen. In uw account ziet u altijd waar die zich bevindt.',
        stages: {
          ordered: 'Besteld',
          collected: 'Geleverd/Verzamelen',
          inTransit: 'In transit',
          arrived: 'Aangekomen op bestemming',
          ready: 'Gereed',
        },
      },
      cta2: {
        title: 'Klaar voor uw volgende zending?',
        lead: 'Beheer uw zendingen en volg alles vanaf één plek.',
        start: 'Begin met verzenden',
        track: 'Zending volgen',
      },
      cta: {
        titleAccent: 'BESTEL DIRECT',
        title: 'EN VEILIG',
        body: 'Wij verzenden uw favoriete producten en spullen van Nederlandse bedrijven btw-vrij naar Curaçao of Bonaire. Zo hoeft u niet langer vrienden en familie lastig te vallen. Neem contact op met ons bedrijf voor meer informatie over onze dienstverlening of vragen.',
        button: 'CONTACTEREN',
        videoLabel: 'Video afspelen',
        videoSlot: 'Video — voeg de poster en de embed toe',
      },
      // "How to order": the five steps of the client's own design.
      steps: {
        title: 'Zo bestelt u',
        account: 'Maak een account aan',
        shop: 'Shop en betaal minder',
        // ­ is a soft hyphen: the long word breaks there when the bar is
        // too narrow for it, and shows no hyphen when it is not.
        payment: 'Vul de juiste betaal­gegevens in',
        documents: 'Upload uw documenten',
        pickup: 'Haal uw bestellingen op',
      },
      shopAndShip: {
        title: 'Shop and ship naar Aruba, Bonaire en Curaçao',
        readMore: 'Lees meer',
        readMoreAbout: 'over',
        particulier: {
          title: 'Particulier',
          body: 'Wij zijn er voor u wanneer u naar het buitenland wilt verhuizen! Een internationale verhuizing vergt veel tijd en energie. Wij hebben hier veel ervaring mee en helpen u om goed voorbereid naar het buitenland te vertrekken. Het is bij ons mogelijk om uw goederen van huis tot huis te transporteren.',
        },
        zakelijk: {
          title: 'Zakelijk',
          body: 'Wij zijn graag alle ondernemingen, klein en groot, van dienst voor alle soorten transport. Voor palletlading, een enkele colli, groter materieel, containers of bulklading bent u bij ons aan het juiste adres. Ons streven is uw wensen zo goed mogelijk in kaart brengen zodat wij deze met de grootste zorgvuldigheid kunnen uitvoeren.',
        },
        payless: {
          title: 'Pay Less Shop More',
          body: 'Wilt u graag Nederlandse producten ontvangen zonder hiervoor uw Nederlandse vrienden en familie hierbij te betrekken? Wij verzenden en versturen alle producten btw-vrij naar uw huis of onderneming in Bonaire of Curaçao.',
        },
      },
    },
    services: {
      hero: {
        title: 'Onze diensten',
        lead: 'Ontdek onze diensten voor Aruba, Bonaire en Curaçao.',
      },
      islandsLabel: 'Onze eilanden',
      companies: {
        title: 'Winkels',
        lead: 'De winkels waar onze klanten het vaakst bestellen.',
        placeholder: 'Naam',
        cta: 'Bekijk winkel',
      },
      // What the company itself does. {min} and {max} are the shortest and
      // longest sailing times, filled in from src/data/destinations.js.
      offer: {
        title: 'Wat wij voor u doen',
        lead: 'Van ons magazijn in Nederland tot de aflevering op het eiland.',
        sea: {
          title: 'Zeevracht',
          body: 'Voor grote, zware of volumineuze zendingen. De vaartijd is {min} tot {max} dagen, afhankelijk van het eiland.',
        },
        air: {
          title: 'Luchtvracht',
          body: 'Heeft u haast? Per luchtvracht is uw zending sneller op het eiland: lever uiterlijk donderdag 12:00 aan en uw zending vliegt in het weekend.',
        },
        warehouse: {
          title: 'Ontvangen en samenvoegen',
          body: 'Wij ontvangen uw pakketten in ons magazijn in Nederland, meten en wegen ze en voegen ze samen tot één zending.',
        },
        customs: {
          title: 'Douane en inklaring',
          body: 'Wij verzorgen de documenten en de inklaring op het eiland: circa anderhalve week bij zeevracht, circa 3–4 dagen bij luchtvracht.',
        },
        delivery: {
          title: 'Aflevering op het eiland',
          body: 'Zodra uw zending gereed is, neemt onze agent contact met u op om de aflevering te regelen.',
        },
        moving: {
          title: 'Verhuizen en zakelijk',
          body: 'Emigreert u, of verstuurt u zakelijk? Ook verhuisgoed, pallets en grotere colli verschepen wij. Vraag gerust naar de mogelijkheden.',
        },
      },
      contactCta: {
        title: 'Benieuwd wat wij voor u kunnen betekenen?',
        button: 'Neem contact met ons op',
      },
      eyebrow: 'ONZE',
      title: 'DIENSTEN',
      breadcrumb: 'Diensten',
      sectionTitle: 'Onze diensten',
      forIsland: 'Onze diensten voor',
      lead: 'Van uw bestelling bij een Nederlandse webshop tot de aflevering bij u thuis op het eiland.',
      islandsTitle: 'Waar wij naartoe verzenden',
      islandsLead: 'Kies uw bestemming om te zien hoe het werkt en een offerte aan te vragen.',
      viewDestination: 'Bekijk bestemming',
      shopsTitle: 'Winkels waar onze klanten bestellen',
      shopsLead: 'U kunt bij vrijwel elke Nederlandse webshop bestellen. Dit zijn de winkels die wij het vaakst zien.',
      ctaTitle: 'Nog vragen over onze diensten?',
      ctaBody: 'Vertel ons wat u wilt laten verzenden, dan sturen wij u een offerte op maat.',
      ctaPrimary: 'Neem contact op',
      ctaSecondary: 'Bekijk bestemmingen',
      highlights: {
        vat: 'Vrijstelling van btw',
        products: 'Unieke producten',
        transport: 'Verzorgd transport',
      },
      actions: {
        book: 'Zending aanmelden',
        destinations: 'Bekijk bestemmingen',
        faq: 'Lees de veelgestelde vragen',
        track: 'Volg uw zending',
        contact: 'Neem contact op',
      },
      shopsFooter:
        'Staat uw winkel er niet bij? Dat geeft niet — u kunt bij vrijwel elke Nederlandse webshop bestellen en uw pakket naar ons magazijn laten sturen.',
      shops: {
        general: {
          title: 'Algemeen aanbod',
          note: 'Grote warenhuizen waar u vrijwel alles in één bestelling kunt vinden.',
        },
        electronics: {
          title: 'Elektronica',
          note: 'Let op de spanning en de stekker: op de eilanden is dat niet altijd hetzelfde als in Nederland.',
        },
        fashion: {
          title: 'Mode en wonen',
          note: 'Kleding en meubels. Grote meubelstukken vallen onder volume — vraag vooraf een offerte aan.',
        },
        beauty: {
          title: 'Beauty en drogisterij',
          note: 'Vloeistoffen en spuitbussen kennen beperkingen bij luchtvracht; per zeevracht is er meer mogelijk.',
        },
        kids: {
          title: 'Kind en speelgoed',
          note: 'Speelgoed en babyartikelen. Speelgoed op batterijen melden wij apart aan.',
        },
        specialist: {
          title: 'Specialistisch',
          note: 'Auto-onderdelen, boeken en kantoorartikelen. Onderdelen met olie of accu vragen extra papieren.',
        },
      },
      rates: {
        title: 'Wat kost het?',
        lead: 'Onze tarieven beginnen bij de bedragen hieronder. Wat u uiteindelijk betaalt hangt af van het volume, het gewicht en de bestemming van uw zending.',
        from: 'vanaf',
        popular: 'Meest gekozen',
        factorsTitle: 'Wat bepaalt de prijs?',
        note: 'Bovenstaande bedragen zijn indicatief en bedoeld als startpunt. Wij meten en wegen uw zending in het magazijn; de offerte die u daarna ontvangt is het bedrag dat geldt.',
        cta: 'Vraag een offerte aan',
        tiers: {
          parcel: {
            name: 'Pakket',
            size: 'Tot ongeveer 30 × 30 × 30 cm',
            body: 'Eén webshopbestelling: kleding, boeken, kleine elektronica of onderdelen.',
          },
          box: {
            name: 'Doos',
            size: 'Tot ongeveer 60 × 40 × 40 cm',
            body: 'Meerdere bestellingen die wij voor u samenvoegen tot één zending.',
          },
          pallet: {
            name: 'Pallet',
            size: 'Vanaf ongeveer 120 × 80 cm',
            body: 'Verhuisgoed, meubels of een zakelijke voorraad.',
          },
        },
        factors: {
          volume: 'Volume en gewicht — wij rekenen met het hoogste van de twee.',
          destination: 'De bestemming en de vaartijd naar die haven.',
          insurance: 'Of u de zending wilt verzekeren voor de waarde ervan.',
        },
      },
      faq: {
        title: 'Veelgestelde vragen',
        more: 'Staat uw vraag er niet bij?',
        contact: 'Neem contact met ons op',
        transit: {
          q: 'Hoe lang duurt een zending?',
          a: 'Reken op 18 tot 28 dagen vanaf het moment dat uw pakket in ons magazijn aankomt. Sint Maarten duurt ongeveer 18 dagen, Aruba en Curaçao 21, Bonaire 24 en Suriname 28 dagen.',
        },
        customs: {
          q: 'Moet ik zelf de douane regelen?',
          a: 'Nee. Wij maken de douanepapieren voor u op en dienen ze in. Invoerrechten en lokale belastingen op de bestemming blijven voor uw rekening; wij laten u vooraf weten waar u rekening mee moet houden.',
        },
        vat: {
          q: 'Krijg ik de btw terug?',
          a: 'Omdat uw bestelling Nederland verlaat, kunt u in veel gevallen vrijstelling van btw krijgen. Dat scheelt tot 21% op de aankoopprijs. Wij vertellen u per webshop of dit mogelijk is en welke gegevens daarvoor nodig zijn.',
        },
        prohibited: {
          q: 'Wat mag ik niet meesturen?',
          a: 'Gevaarlijke stoffen, brandbare vloeistoffen, losse lithiumaccu’s, wapens, bederfelijke waren, geld en levende dieren kunnen wij niet vervoeren. Twijfelt u over een artikel, vraag het ons dan voordat u bestelt.',
        },
        insurance: {
          q: 'Is mijn zending verzekerd?',
          a: 'Standaard geldt de basisdekking van de vervoerder, die uitgaat van het gewicht en niet van de waarde. Bij het aanmelden kunt u de zending voor de aankoopwaarde verzekeren; dat raden wij aan bij elektronica en andere kostbare artikelen.',
        },
      },
    },
    contact: {
      eyebrow: 'NEEM',
      title: 'CONTACT OP',
      breadcrumb: 'Contact',
      formTitle: 'Stuur ons een bericht',
      lead:
        'Vragen over een zending, een offerte of onze dienstverlening? Bel of mail ons, of vul het formulier hieronder in.',
      charactersToGo: 'Nog {count} tekens te gaan.',
      addressTitle: 'Adresgegevens',
      fields: {
        name: 'Naam',
        email: 'E-mail',
        subject: 'Onderwerp',
        message: 'Bericht',
      },
      subjects: [
        'Algemene vraag',
        'Verzending & tracking',
        'BTW-vrij verzenden',
        'Klacht',
        'Samenwerking',
      ],
      errors: {
        name: 'Vul uw naam in.',
        emailRequired: 'Vul uw e-mailadres in.',
        emailInvalid: 'Dit e-mailadres lijkt niet te kloppen.',
        message: 'Uw bericht moet minstens 10 tekens bevatten.',
        invalid: 'Controleer de ingevulde gegevens.',
        tooMany: 'Te veel berichten verstuurd. Probeer het over een uur opnieuw.',
        offline: 'Versturen lukt nu niet. Probeer het later opnieuw.',
      },
      submit: 'Verstuur bericht',
      sending: 'Bezig met versturen…',
      success:
        'Bedankt! Uw bericht is verstuurd — we reageren binnen twee werkdagen.',
      details: {
        address: 'Adres:',
        phone: 'Telefoon:',
        email: 'E-mail:',
      },
      openInMaps: 'Openen in Maps',
      mapLabel: 'Locatie op de kaart',
      mapTitle: 'Kaart met de locatie aan de Hertzstraat 10, Berkel en Rodenrijs',
    },
    // Notifications: the alert in the corner and the bell in the header
    // (src/components/Notifications). The words per shipment status match
    // the e-mails (backend notifications/messages.py).
    notifications: {
      title: 'Meldingen',
      bell: 'Meldingen',
      bellUnread: 'Meldingen, {count} ongelezen',
      readAll: 'Alles gelezen',
      empty: 'U heeft nog geen meldingen.',
      open: 'Bekijken',
      closeAlert: 'Melding sluiten',
      shipment: 'Zending {tracking}',
      receivedItem: '{item} (van {shop})',
      confirmationRequested: '{booking} · {item} (van {shop})',
      status: {
        received: 'Uw zending is aangekomen in ons magazijn',
        quoted: 'Uw offerte staat klaar',
        paid: 'Betaling ontvangen',
        purchased: 'Uw producten zijn gekocht',
        ready_for_shipping: 'Uw zending is ingepakt en klaar voor vertrek',
        in_transit: 'Uw zending is onderweg',
        arrived: 'Uw zending is aangekomen',
        delivered: 'Uw zending is afgeleverd',
        cancelled: 'Uw zending is geannuleerd',
        courier_delivered: "Uw bestelling is bezorgd bij ons magazijn",
        courier_delivery_failed: "De koerier kon uw bestelling niet bezorgen",
        courier_delayed: "Uw bestelling heeft vertraging",
        courier_returned: "Uw bestelling gaat terug naar de winkel",
        courier_exception: "Er is een probleem met de bezorging van uw bestelling",
        item_received: 'Een product van uw bestelling is aangekomen in ons magazijn',
        order_received: 'Uw bestelling is aangekomen in ons magazijn',
        invoice_requested: 'Wij missen de factuur van uw bestelling',
        confirmation_requested: 'Orderbevestiging gevraagd',
        prealert_submitted: "Uw vooraanmelding is geregistreerd",
        other: 'Er is nieuws over uw zending',
      },
      invoice: {
        title: 'Nieuwe factuur',
        text: 'Factuur {invoice} voor zending {tracking} staat voor u klaar.',
      },
    },

    // The FAQ page (src/pages/Faq). Which categories and questions there are,
    // in which order, and which page a question links to, is set in
    // src/pages/Faq/faqContent.js; every language must have the same keys
    // (a test checks this). {address} is filled in from src/data/company.js.
    // The chat assistant (components/ChatAssistant).
    chat: {
      ask: 'Stel uw vraag aan onze assistent',
      title: 'Assistent',
      subtitle: 'Vragen, verzendkosten en hulp bij boeken',
      back: 'Terug naar hulp',
      welcome: 'Hallo! Ik ben de assistent van Pay Less Shop More. Ik kan vragen beantwoorden, verzendkosten berekenen en u helpen het boekingsformulier in te vullen. Waarmee kan ik helpen?',
      suggestions: {
        costs: 'Wat kost verzenden naar Curaçao?',
        booking: 'Help mij het boekingsformulier in te vullen',
        how: 'Hoe werkt het?',
        parcel: 'Waar is mijn pakket?',
      },
      placeholder: 'Typ uw vraag…',
      send: 'Versturen',
      thinking: 'De assistent schrijft een antwoord',
      disclaimer: 'Antwoorden worden door AI gemaakt en kunnen fouten bevatten. Prijzen zijn een indicatie.',
      errors: {
        tooMany: 'U heeft veel vragen gesteld. Probeer het over een tijdje opnieuw, of neem contact met ons op.',
        unavailable: 'De assistent kan nu niet antwoorden. Probeer het later opnieuw, of neem contact met ons op.',
      },
    },
    faq: {
      title: 'Veelgestelde vragen',
      summary:
        'Antwoorden op de vragen die wij het vaakst krijgen: over verschepen, auto’s, ophalen en bezorgen, inpakken, lokale kosten, verzekeren en betalen.',
      intro: 'Op deze pagina vindt u antwoorden op de veelgestelde vragen. Klik op een onderwerp om de vragen te zien.',
      important: {
        title: 'Belangrijk bij het verzenden van goederen',
        lead: 'Vanwege strenge douanecontroles op de eilanden is het verplicht de juiste documenten aan te leveren:',
        items: [
          'Voor nieuwe goederen: een factuur.',
          'Voor gebruikte goederen: een volledige, duidelijk gespecificeerde paklijst met de (dag)waarden.',
          'Voor motorvoertuigen: een factuur of waardeverklaring. Motoren of scooters uit Duitsland worden niet geaccepteerd.',
        ],
        after: 'Zonder deze documenten kunnen wij uw goederen niet verzenden.',
      },
      more: 'Staat uw vraag er niet bij?',
      contactUs: 'Neem contact met ons op',
      categories: {
        goods: {
          title: 'Goederen verschepen',
          questions: {
            appointment: {
              q: 'Dien ik een afspraak te maken om langs te komen op kantoor?',
              a: 'Dat is niet verplicht, maar wel aan te raden. Als u van tevoren belt om door te geven dat u eraan komt, kunnen wij u ontvangen op ons kantoor aan de {address}.',
            },
            arrival: {
              q: 'Wanneer hoor ik of mijn goederen zijn aangekomen?',
              a: 'Enkele dagen voordat uw goederen aankomen op de bestemming, neemt onze lokale agent contact op met de ontvanger.',
            },
            container: {
              q: 'Ik wil mijn goederen verschepen, maar ik heb niet genoeg om een container te vullen:',
              a: 'Dat is bij Pay Less Shop More geen probleem. U kunt uw goederen met een groupage zending verschepen. Hierbij deelt u de container en daarmee ook de lokale kosten met anderen.',
              link: 'Bekijk onze diensten',
            },
            volume: {
              q: 'Ik wil graag een offerte aanvragen, maar ik weet niet hoeveel m³ ik heb om te verschepen:',
              a: 'U kunt een e-mail sturen met de afmetingen van uw persoonlijke goederen. Daarnaast bieden wij de mogelijkheid om gratis en geheel vrijblijvend bij u langs te komen om uw goederen te bekijken en te meten.',
              link: 'Neem contact op',
            },
          },
        },
        car: {
          title: 'Auto verschepen',
          questions: {
            pickup: {
              q: 'Haalt Pay Less Shop More mijn auto ook op?',
              a: 'Nee, wij rijden niet in de voertuigen van een ander. Pay Less Shop More vraagt onze klanten daarom altijd de voertuigen naar onze loods in Rotterdam te brengen. Indien u geen andere mogelijkheid heeft om de auto te vervoeren, kunt u contact opnemen om de mogelijkheden te bespreken.',
            },
            cargo: {
              q: 'Mag ik spullen in mijn auto vervoeren?',
              a: 'Ja, u mag goederen in uw auto vervoeren. Voorwaarde hiervoor is dat de auto bestuurbaar blijft en u een paklijst aanlevert van alle goederen die zich in de auto bevinden.',
            },
            deregister: {
              q: 'Wordt mijn auto afgemeld door Pay Less Shop More?',
              a: 'Pay Less Shop More meldt de auto voor u af bij de RDW. Hiervoor hebben we alle autopapieren nodig en een kopie van uw ID. De autopapieren krijgt u vervolgens weer terug, eventueel via de post.',
            },
          },
        },
        pickupDelivery: {
          title: 'Goederen ophalen & brengen',
          questions: {
            home: {
              q: 'Haalt Pay Less Shop More de goederen ook bij mij thuis op?',
              a: 'Pay Less Shop More haalt ook goederen op bij het adres naar uw keuze. De prijs hiervoor is afhankelijk van het aantal m³ van de goederen en de woonplaats.',
            },
            webshop: {
              q: 'Als ik goederen bestel bij een bedrijf, kan ik deze dan direct naar jullie loods zenden?',
              a: 'Dit is mogelijk. Communiceer duidelijk met ons wanneer we deze goederen kunnen verwachten. Bij Contact vindt u onze openingstijden en contactgegevens.',
              link: 'Naar Contact',
            },
            weekend: {
              q: 'Haalt Pay Less Shop More mijn goederen ook in het weekend op?',
              a: 'Nee, dit is niet gebruikelijk. U kunt contact opnemen met één van onze medewerkers om de opties hiervoor te bespreken.',
            },
            delivery: {
              q: 'Levert Pay Less Shop More mijn goederen ook af op het adres dat ik opgeef?',
              a: 'Onze service loopt tot de haven van de bestemming. Het is mogelijk dat uw goederen naar het adres van uw keuze gebracht worden. Wij kunnen het doorgeven aan onze lokale agent en dit wordt dan door hen geregeld.',
            },
          },
        },
        packing: {
          title: 'Goederen inpakken',
          questions: {
            seaworthy: {
              q: 'Hoe zorg ik ervoor dat mijn goederen zeewaardig ingepakt worden?',
              a: 'U kunt gebruikmaken van de inpakservice van Pay Less Shop More, waarbij ook het juiste materiaal geleverd wordt. U kunt de goederen ook zelf inpakken. Bij het aanmelden van een zending kiest u wie er inpakt.',
              link: 'Zending aanmelden',
            },
          },
        },
        localCosts: {
          title: 'Lokale kosten',
          questions: {
            what: {
              q: 'Wat houden de lokale kosten in?',
              a: 'De lokale kosten zijn kosten die gemaakt worden op de plek van bestemming, denk aan het lossen en uitladen van de container. Deze kosten worden bij de lokale agent afgerekend en vallen buiten onze offerteprijzen.',
            },
            emigrate: {
              q: 'Betaal ik ook lokale kosten als ik emigreer?',
              a: 'U betaalt wel lokale kosten, maar u kunt uw goederen invoerrechtenvrij invoeren. U dient hiervoor uitgeschreven te zijn in Nederland en ingeschreven in het land van bestemming. Meer informatie vindt u bij bestemmingen.',
              link: 'Bekijk de bestemmingen',
            },
            prepay: {
              q: 'Waarom kan ik de lokale kosten op bestemming niet vooraf betalen?',
              a: 'Het is voor ons moeilijk in te schatten wat de lokale kosten worden. De douane bepaalt in sommige gevallen de waarde van de goederen en dit zorgt ervoor dat we nooit zekerheid kunnen geven over de hoogte van deze kosten.',
            },
          },
        },
        insurance: {
          title: 'Verzekeren',
          questions: {
            insured: {
              q: 'Zijn mijn goederen verzekerd?',
              a: 'Uw goederen zijn niet standaard verzekerd. Het is mogelijk om een transportverzekering via Pay Less Shop More af te sluiten. Neem contact op voor meer informatie.',
              link: 'Neem contact op',
            },
            damage: {
              q: 'Wat gebeurt er als ik schade heb aan mijn goederen?',
              a: 'Schade tijdens de verscheping wordt niet vergoed als u geen transportverzekering heeft afgesloten.',
              link: 'Vraag naar een verzekering',
            },
          },
        },
        payment: {
          title: 'Betalen',
          questions: {
            how: {
              q: 'Hoe gaat de betaling in zijn werk?',
              a: 'Wanneer uw goederen opgehaald worden (indien dat het geval is), kunt u de factuur contant of per bank voldoen. Wanneer u garantie wilt van een plek op de boot, dient u (in overleg) een aanbetaling te doen. Het volledige bedrag dient altijd betaald te zijn voordat de goederen vertrekken vanuit Rotterdam.',
            },
          },
        },
      },
    },

    // The Terms & Conditions page (src/pages/Terms). Only the page around the
    // conditions is translated: the conditions themselves are in English in
    // src/data/terms.js (legal text, the Dutch original prevails).
    terms: {
      title: 'Algemene voorwaarden',
      summary:
        'De expeditievoorwaarden en opslagvoorwaarden van Pay Less Shop More: de afspraken die gelden voor elke zending en voor opslag in ons magazijn.',
      languageNote:
        'Deze voorwaarden staan hieronder in het Engels. Bij een verschil tussen de Engelse en de Nederlandse tekst is de Nederlandse tekst beslissend.',
      contents: 'Inhoud',
      article: 'Artikel',
      section: 'Sectie',
      incomplete: 'De rest van deze voorwaarden wordt binnenkort toegevoegd. Neem contact met ons op als u de volledige tekst nodig heeft.',
      questions: 'Heeft u een vraag over deze voorwaarden? Neem dan contact met ons op via',
      backToTop: 'Terug naar boven',
    },

    // The privacy statement (src/pages/Privacy). The order of the sections
    // is set in Privacy.jsx; every language must have the same keys and the
    // same number of items in each list (a test checks this).
    // {address} and {number} are filled in from src/data/company.js.
    privacy: {
      title: 'Privacybeleid',
      summary:
        'Hoe Pay Less Shop More met uw persoonsgegevens omgaat: welke gegevens wij verzamelen, waarom, met wie wij ze delen en wat uw rechten zijn.',
      questions: 'Heeft u een vraag over dit privacybeleid? Neem dan contact met ons op via',
      intro: [
        'Uw privacy is belangrijk voor ons bij Pay Less Shop More. Wij gebruiken uw persoonsgegevens uitsluitend om uw account te beheren en onze diensten aan u te leveren. Wij hechten veel waarde aan de bescherming, vertrouwelijkheid en integriteit van uw persoonsgegevens. In dit privacybeleid leggen wij uit welke persoonsgegevens wij verzamelen wanneer u gebruikmaakt van onze diensten, waarom wij deze gegevens nodig hebben en hoe wij ze gebruiken.',
      ],
      sections: {
        services: {
          heading: 'Onze diensten',
          body: [
            'Pay Less Shop More verzorgt als expediteur het transport van uw goederen. Dit privacybeleid is van toepassing op deze diensten en de bijbehorende platforms.',
          ],
        },
        data: {
          heading: 'Welke persoonsgegevens worden verzameld?',
          body: [
            'Wij hebben bepaalde persoonsgegevens nodig om u zo goed mogelijk van dienst te zijn en u te informeren over onze diensten.',
            'Wanneer u gebruikmaakt van de diensten van Pay Less Shop More, verwerken wij de volgende gegevens:',
          ],
          list: [
            'Voor- en achternaam',
            'E-mailadres',
            'Telefoonnummer',
            'Woonadres',
            'Bedrijfsnaam (indien van toepassing)',
          ],
        },
        thirdParties: {
          heading: 'Derden',
          body: [
            'Wij ontvangen ook informatie van derden met wie wij samenwerken. Hoewel onze partners kunnen wijzigen, zijn dit:',
          ],
          list: [
            'Onze agenten op de verschillende bestemmingen, namelijk: Fast Delivery Services, Anper NV en Cavalier Logistics.',
            'Leveranciers die goederen voor u afleveren, die wij vervolgens voor u doorsturen.',
          ],
        },
        purposes: {
          heading: 'Hoe gebruiken wij uw persoonsgegevens?',
          body: [
            'Wij gebruiken uw persoonsgegevens uitsluitend voor de doeleinden waarvoor ze zijn verzameld en, waar van toepassing, om te voldoen aan wettelijke verplichtingen. Wij gebruiken uw persoonsgegevens voor de volgende doeleinden:',
          ],
          items: [
            {
              term: 'Uitvoering van de overeenkomsten.',
              text: 'Wij verwerken uw persoonsgegevens om u de diensten van uw keuze te leveren.',
            },
            {
              term: 'Klantcontact en communicatie.',
              text: 'Wij gebruiken uw gegevens om met u te communiceren per e-mail of telefoon in verband met onze diensten. Zo kunt u facturen van ons ontvangen en kunnen wij u op de hoogte houden van uw zending en u uitnodigen om deel te nemen aan klanttevredenheidsonderzoeken.',
            },
            {
              term: 'Marketing.',
              text: 'Wij houden u graag op de hoogte van onze diensten via e-mail of sociale media. U heeft altijd het recht om u hiervoor af te melden.',
            },
            {
              term: 'Veiligheid, beveiliging en geschillenbeslechting.',
              text: 'Wij gebruiken uw gegevens om de veiligheid, integriteit en bescherming van onze diensten en klanten te waarborgen. Waar nodig kunnen wij uw gegevens gebruiken bij het beslechten van geschillen, om de naleving van de overeenkomst met u af te dwingen, om onze rechten tegenover derden te handhaven of om ons te verweren tegen claims of beschuldigingen van derden.',
            },
            {
              term: 'Wettelijke verplichtingen.',
              text: 'Wij kunnen uw gegevens verwerken om te voldoen aan wettelijke verplichtingen, bijvoorbeeld het bijhouden van administratie of het voldoen aan rechtmatige verzoeken van bevoegde autoriteiten (zoals politie of justitie).',
            },
            {
              term: 'Verbeteren en personaliseren van onze diensten.',
              text: 'Wij gebruiken uw persoonsgegevens om onze diensten te verbeteren. Inzicht in klikgedrag en zoekresultaten op onze website kan ons bijvoorbeeld helpen onze diensten te optimaliseren.',
            },
            {
              term: 'Onderhoud, ontwikkeling en incidentbeheer.',
              text: 'Als u problemen ondervindt met een van onze diensten, kan het nodig zijn persoonsgegevens te verwerken om tot een oplossing te komen. Ook verwerken wij uw persoonsgegevens voor bepaalde interne operationele processen, bijvoorbeeld bij het overzetten van klantgegevens naar een nieuwe database.',
            },
            {
              term: 'Uitvoering van algemene bedrijfsprocessen, interne bedrijfsvoering en managementrapportage.',
              text: 'Voor het uitvoeren van onze bedrijfsactiviteiten gebruiken wij uw persoonsgegevens voor algemene bedrijfsprocessen. Zo verwerken wij uw gegevens bijvoorbeeld voor archivering, verzekeringen, managementrapportages, audits en andere administratieve doeleinden.',
            },
          ],
        },
        sharing: {
          heading: 'Met wie delen wij uw persoonsgegevens?',
          body: [
            'Wij delen uw persoonsgegevens met derden, zoals agenten op uw bestemming en andere partners, afhankelijk van de diensten die u gebruikt. Wij delen uw gegevens:',
          ],
          list: [
            'Voor zover nodig om onze bedrijfsactiviteiten uit te voeren, onze diensten te leveren en de diensten van onze partners mogelijk te maken. Denk hierbij aan het kunnen uitvoeren van bepaalde transporten, bijvoorbeeld per luchtvracht, en het met u kunnen communiceren in verband met onze diensten;',
            'In gevallen waarin u ons hiervoor uitdrukkelijk toestemming heeft gegeven;',
            'Als ons dat rechtmatig wordt gevraagd in het kader van rechtshandhaving, bijvoorbeeld bij onderzoeken naar illegale activiteiten;',
            'Om, waar van toepassing, onze overeenkomst met u af te dwingen. Als u bijvoorbeeld niet voor onze diensten heeft betaald, kunnen wij uw gegevens delen met een incassobureau;',
            'Om onze rechten tegenover derden te handhaven of om ons te verweren tegen claims of beschuldigingen van derden;',
            'Om de veiligheid, integriteit en bescherming van onze diensten te waarborgen.',
          ],
          after: [
            'Het delen van gegevens binnen het bedrijf gebeurt uitsluitend ten behoeve van onze bedrijfsactiviteiten, onze dienstverlening aan u en zoals beschreven in dit privacybeleid.',
          ],
        },
        location: {
          heading: 'Waar worden uw persoonsgegevens verwerkt?',
          body: [
            'Uw persoonsgegevens worden in de eerste plaats verwerkt door onze medewerkers op ons kantoor in Nederland. Afhankelijk van uw locatie en waar van toepassing kunnen bepaalde gegevens worden verwerkt door lokale agenten (zoals op Curaçao), bijvoorbeeld voor de lokale afhandeling of lokale marketingcampagnes.',
            'Voor zover wij persoonsgegevens doorgeven aan een land buiten de Europese Unie of aan een internationale organisatie, zorgen wij ervoor dat dit uitsluitend gebeurt naar landen en organisaties die een passende bescherming van uw gegevens en rechten bieden in overeenstemming met de Algemene verordening gegevensbescherming (AVG), of wanneer dit anderszins is toegestaan op grond van de AVG.',
          ],
        },
        retention: {
          heading: 'Hoe lang bewaren wij uw persoonsgegevens?',
          body: [
            'Wij bewaren uw persoonsgegevens niet langer dan nodig is voor de doeleinden waarvoor ze zijn verzameld of worden gebruikt en/of zolang de wet dat vereist.',
            'Wilt u dat uw gegevens worden verwijderd? Neem dan contact op met ons kantoor. Op uw verzoek verwijderen wij uw persoonsgegevens zonder onnodige vertraging, met uitzondering van gegevens die wij wettelijk moeten bewaren. Zo zijn wij wettelijk verplicht gegevens zoals kopieën van facturen zeven jaar te bewaren.',
          ],
        },
        loginMonitoring: {
          heading: 'Beveiliging en inlogcontrole',
          body: [
            'Om ons platform en uw account te beschermen, registreren wij elke inlogpoging, gelukt of mislukt. Per poging bewaren wij het account of e-mailadres dat is ingevoerd, uw IP-adres, het land en de plaats die daar bij benadering bij horen, het tijdstip, het soort browser, besturingssysteem en apparaat en de manier van inloggen. Wachtwoorden, pincodes en codes slaan wij nooit op, ook niet als ze onjuist zijn.',
            'Het doel is misbruik op te sporen, bijvoorbeeld veel mislukte pogingen of een inlog vanaf een onverwacht apparaat. Alleen medewerkers van ons kantoor met een beheerrol kunnen deze gegevens inzien. Een ongebruikelijke plaats of een nieuw apparaat is voor ons alleen een signaal om te kijken, geen bewijs van misbruik, en wij nemen op die grond geen geautomatiseerde beslissingen over uw account.',
            'De plaats bepalen wij bij benadering uit uw IP-adres. Wij gebruiken nooit GPS of de locatie van uw apparaat. Voor die bepaling kan uw IP-adres worden voorgelegd aan een geolocatiedienst (ipwho.is). Deze inloggegevens bewaren wij maximaal 90 dagen en verwijderen wij daarna. Onze rechtsgrond is ons gerechtvaardigde belang bij de beveiliging van onze diensten en van uw account.',
          ],
        },
        legalBasis: {
          heading: 'Rechtsgrond voor de verwerking',
          body: [
            'Wij verzamelen en verwerken uw persoonsgegevens alleen wanneer wij daarvoor een rechtsgrond hebben. De volgende rechtsgronden zijn van toepassing:',
          ],
          list: [
            'De verwerking is noodzakelijk voor de uitvoering van uw overeenkomst;',
            'De verwerking is noodzakelijk voor de behartiging van onze gerechtvaardigde bedrijfsbelangen, bijvoorbeeld i) om onze bedrijfsactiviteiten uit te voeren; ii) voor bepaalde vormen van direct marketing en profilering; iii) om informatie over uw account te archiveren, zodat u het later opnieuw kunt activeren; iv) om fraude of misbruik van onze diensten op te sporen of te voorkomen; of v) voor de beveiliging van ons netwerk en onze systemen;',
            'De verwerking is noodzakelijk om te voldoen aan een wettelijke verplichting, zoals de bewaarplicht voor administratieve gegevens of het delen van bepaalde informatie naar aanleiding van een bevel van de politie voor een strafrechtelijk onderzoek;',
            'U heeft ons uitdrukkelijk toestemming gegeven voor de verwerking, bijvoorbeeld voor het delen van gegevens met partners voor commerciële doeleinden.',
          ],
          after: [
            'Wanneer de verwerking is gebaseerd op toestemming, heeft u altijd het recht uw toestemming in te trekken. In dat geval beëindigen wij de betreffende verwerking van uw gegevens. Het intrekken van uw toestemming heeft geen gevolgen voor de rechtmatigheid van de verwerking op basis van toestemming vóór de intrekking.',
          ],
        },
        complaints: {
          heading: 'Vragen en klachten',
          body: [
            'Heeft u vragen over hoe wij uw persoonsgegevens gebruiken? Neem dan contact op met ons kantoor.',
            'Heeft u het gevoel dat een probleem niet goed is opgelost, dan heeft u ook het recht een klacht in te dienen bij de Autoriteit Persoonsgegevens.',
          ],
        },
        controller: {
          heading: 'Verantwoordelijke',
          body: ['Pay Less Shop More is een expediteur, gevestigd aan {address}.'],
          // Only shown once the number is filled in, in src/data/company.js.
          registration: 'Pay Less Shop More is ingeschreven bij de Kamer van Koophandel onder nummer {number}.',
          after: [
            'Beslissingen over de doeleinden en middelen van de verwerking van persoonsgegevens worden in beginsel centraal genomen door Pay Less Shop More, dat optreedt als verwerkingsverantwoordelijke voor de verwerking van deze persoonsgegevens.',
          ],
        },
      },
    },
    guide: {
      eyebrow: 'Uitleg bij deze pagina',
      // The robot panel: greeting, the "On this page" box, Read more/less.
      greeting: 'Hoi! Waarmee kan ik helpen?',
      onThisPage: 'Op deze pagina',
      more: 'Meer lezen',
      less: 'Minder tonen',
      panelLabel: 'Uitleg bij deze pagina',
      openLabel: 'Hulp en uitleg bij deze pagina openen',
      hint: 'Klik hier voor hulp',
      hintClose: 'Melding sluiten',
      close: 'Sluiten',
      listen: 'Lees voor',
      stop: 'Stop',
      dontShow: 'Niet meer automatisch tonen',
      pages: {
        faq: {
          title: 'Veelgestelde vragen',
          body:
            'Hier vindt u antwoorden op de vragen die wij het vaakst krijgen. Klik op een onderwerp om de vragen en antwoorden te zien.',
          bullets: [
            'Onderaan staat welke documenten de douane vraagt.',
            'Staat uw vraag er niet bij? Neem contact met ons op.',
          ],
        },
        blog: {
          title: 'Blog',
          body:
            'Tips en uitleg over bestellen bij Nederlandse webshops en verzenden naar de eilanden. Klik op een bericht om het te lezen.',
        },
        terms: {
          title: 'Algemene voorwaarden',
          body:
            'Hier staan de voorwaarden die gelden voor elke zending en voor opslag in ons magazijn. De tekst is in het Engels; bij een verschil is de Nederlandse tekst beslissend.',
          bullets: [
            'Klik in de inhoud op een artikel om er direct naartoe te gaan.',
          ],
        },
        privacy: {
          title: 'Privacybeleid',
          body:
            'Hier leest u welke persoonsgegevens wij verzamelen, waarom, met wie wij ze delen en wat uw rechten zijn.',
        },
        home: {
          title: 'Welkom bij PayLesShopMore',
          body:
            'Hier begint alles. Wij ontvangen uw bestellingen in Nederland en sturen ze door naar het eiland.',
          bullets: [
            'Bekijk "Diensten" om te zien wat wij voor u kunnen doen.',
            'Onder "Bestemmingen" leest u hoe het per eiland werkt.',
            'Klaar om te versturen? Ga naar "Boeking".',
          ],
        },
        services: {
          title: 'Onze diensten',
          body:
            'Hier ziet u wat wij voor u doen, van zeevracht en luchtvracht tot de aflevering op het eiland, en bij welke winkels onze klanten bestellen.',
          bullets: [
            'Kies uw bestemming voor de details van dat eiland.',
            'Twijfelt u over een product? Vraag het ons vooraf.',
          ],
        },
        booking: {
          title: 'Zending aanmelden',
          body:
            'Met deze boekingsbon meldt u uw zending bij ons aan, in plaats van op papier. Hoe vollediger, hoe sneller wij uw zending kunnen verwerken.',
          bullets: [
            'Kies of u het hele formulier in één keer invult of stap voor stap.',
            'Kies per winkel waar u besteld heeft en wat u daar kocht. Een screenshot van uw bestelling helpt.',
            'Bent u ingelogd? Dan staat de boeking daarna in uw account bij "Mijn boekingen", waar u ook de factuur of track-and-trace kunt toevoegen.',
          ],
        },
        tracking: {
          title: 'Volg uw zending',
          body:
            'Vul uw trackingcode in en u ziet waar uw zending is: bij ons in het magazijn, onderweg, of klaar voor aflevering.',
          bullets: [
            'De code staat in de e-mail die u van ons kreeg.',
            'U ziet hier alleen de zendingen die bij uw account horen.',
          ],
        },
        destinations: {
          title: 'Onze bestemmingen',
          body:
            'Kies het eiland waar uw zending naartoe gaat. Per bestemming leest u de doorlooptijd, de mogelijkheden en hoe de aflevering gaat.',
        },
        destination: {
          title: 'Deze bestemming',
          body:
            'Hier staat hoe wij naar dit eiland verzenden en wat u kunt verwachten. Onderaan vraagt u direct een offerte aan.',
        },
        profile: {
          title: 'Uw account',
          body:
            'Uw gegevens, adressen, zendingen en facturen staan hier bij elkaar, net als Track & Trace.',
          bullets: [
            'Houd uw afleveradres actueel — daar gaat uw zending naartoe.',
            'Facturen en pakbonnen kunt u hier downloaden.',
            'Meld een pakket vooraf aan bij "Mijn zendingen". Een aangegeven waarde is niet meer nodig.',
            'Kies in een zending "Bezorgen" of "Zelf ophalen". U kiest maar één keer; wijzigen gaat daarna per e-mail.',
          ],
        },
        prealert: {
          title: 'Pakket vooraanmelden',
          body:
            'Hier laat u ons weten dat er een pakket naar ons magazijn onderweg is. Zo weten wij dat het van u is zodra het binnenkomt.',
          bullets: [
            'Het trackingnummer en de koerier staan in de verzendmail van de winkel.',
            'Een aangegeven waarde is niet nodig.',
            'Voeg de factuur van de winkel toe, dan gaat de douane sneller.',
          ],
        },
        login: {
          title: 'Inloggen',
          body:
            'Log in met het e-mailadres waarmee u zich heeft aangemeld. Wachtwoord vergeten? Gebruik de link onder het formulier — u krijgt binnen enkele minuten een e-mail.',
        },
        signup: {
          title: 'Account aanmaken',
          body:
            'Vul uw naam, e-mailadres en wachtwoord in. Daarna kunt u zendingen aanmelden en volgen.',
          bullets: [
            'Gebruik een e-mailadres dat u dagelijks leest: daar sturen wij alles naartoe.',
            'Uw afleveradres vult u later in uw account in.',
          ],
        },
        contact: {
          title: 'Neem contact op',
          body:
            'Stel hier uw vraag. Vermeld uw trackingcode of ordernummer als uw vraag over een zending gaat, dan kunnen wij direct meekijken.',
        },
      },
    },
    // The onboarding tour (src/components/Tutorial) and its "?" help button.
    // Steps: onboarding.steps.<id> must match the ids in
    // src/components/Tutorial/tutorialSteps.js. Each step has a `title` and
    // optionally `text`, `points` (bullet list), `note` and `warning`.
    // Shipping times are NOT here: they come from src/data/destinations.js.
    onboarding: {
      stepOf: 'Stap {current} van {total}',
      progressLabel: 'Voortgang van de uitleg',
      duration: 'Ongeveer 2 minuten',
      start: 'Start de uitleg',
      skip: 'Uitleg overslaan',
      close: 'Uitleg sluiten',
      back: 'Vorige',
      next: 'Volgende',
      finish: 'Afronden',
      openWebsite: 'Naar de website',
      steps: {
        welcome: {
          title: 'Welkom bij Pay Less Shop More',
          text: 'Wij nemen u mee in een korte rondleiding en laten zien hoe winkelen en verzenden werkt.',
        },
        account: {
          title: 'Maak uw account aan',
          text: 'Maak uw Pay Less Shop More-account aan, zodat u uw bestellingen, zendingen en persoonlijke gegevens kunt beheren.',
          points: [
            'Gebruik de knop "Aanmelden" bovenaan de pagina. Op een telefoon vindt u die in het menu (☰).',
            'Vul uw eigen persoonlijke gegevens in: uw eigen naam, e-mailadres en telefoonnummer.',
          ],
        },
        shop: {
          title: 'Shop bij uw favoriete winkels',
          text: 'Koop producten bij Nederlandse webshops en laat uw aankopen bezorgen in ons magazijn in Nederland.',
          points: [
            'Gebruik bij het afrekenen het magazijnadres van Pay Less Shop More als afleveradres. In de volgende stap ziet u precies wat u invult.',
          ],
          note: 'Rond de betaling direct af. Achteraf betalen is niet toegestaan.',
        },
        address: {
          title: 'Laat uw bestelling naar ons magazijn sturen',
          text: 'Gebruik dit adres bij het bestellen in een Nederlandse webshop, zowel bij de factuurgegevens als bij het afleveradres.',
          warning: 'Vul het magazijnadres precies zo in als hier staat, bij de factuurgegevens én bij het afleveradres. Is dat niet goed ingevuld, dan kunnen wij uw zending niet verwerken.',
        },
        // {email} is filled in from src/data/company.js.
        register: {
          title: 'Meld uw zending bij ons aan',
          text: 'Laat ons na het bestellen weten dat er een pakket naar ons magazijn onderweg is. Zo weten wij dat het van u is zodra het binnenkomt.',
          points: [
            'Meld het pakket vooraf aan in uw account (Mijn zendingen), met het trackingnummer en de koerier.',
            'Voeg de factuur van de webshop toe, dan gaat de douane sneller.',
          ],
        },
        warehouse: {
          title: 'Uw pakket komt aan in ons magazijn',
          text: 'Zodra uw pakket in ons magazijn aankomt, verwerken wij het en maken wij het klaar voor verzending naar uw bestemming.',
        },
        shipping: {
          title: 'Kies uw verzendwijze',
        },
        track: {
          title: 'Volg uw zending',
          text: 'Met Track & Trace bekijkt u de laatst beschikbare informatie over uw zending.',
          points: [
            'Track & Trace staat in uw account: log in en klik bovenaan op uw naam.',
            'De informatie verschijnt zodra die voor uw zending beschikbaar is.',
          ],
        },
        // The "Feedback" tab on the right edge (components/Feedback).
        feedback: {
          title: 'Vertel ons wat u ervan vindt',
          text: 'Met de gele knop "Feedback" aan de rechterkant van elke pagina geeft u ons sterren en een opmerking. Na een levering vragen wij u ook om die te beoordelen.',
        },
        help: {
          title: 'Hulp nodig?',
          text: 'Ons team helpt u graag met vragen over:',
        },
      },
      address: {
        firstName: 'Voornaam',
        lastName: 'Achternaam',
        street: 'Adres',
        postcode: 'Postcode',
        city: 'Plaats',
        country: 'Land',
        countryValue: 'Nederland',
        copy: 'Adres kopiëren',
        copied: 'Adres gekopieerd!',
        copyFailed: 'Kopiëren lukte niet. Selecteer het adres en kopieer het zelf.',
      },
      flow: {
        label: 'Van webshop tot uw bestemming',
        store: 'Webshop',
        warehouse: 'Magazijn van Pay Less Shop More',
        shipping: 'Verzending',
        destination: 'Uw bestemming',
      },
      shipping: {
        allIslands: 'Alle eilanden',
        faster: 'De snelste optie.',
        disclaimer: 'Dit zijn schattingen. De werkelijke duur hangt af van het verzendschema en de omstandigheden.',
        quoteQuestion: 'Wilt u weten wat het kost?',
        quoteLink: 'Kies uw eiland en vraag een offerte aan',
      },
      help: {
        topics: [
          'Verzendkosten',
          'Douane',
          'Grote spullen',
          'Zakelijk verzenden',
          'Andere bestemmingen',
          'Algemene vragen',
        ],
        contact: 'Neem contact op met ons team:',
        again: 'Klik op elke pagina op de robot linksonder en kies "Rondleiding door deze pagina": de robot legt dan die pagina uit. Op de homepage start deze uitleg opnieuw.',
        doneTitle: 'U bent er klaar voor!',
        doneText: 'U kent nu de basis van winkelen en verzenden met Pay Less Shop More.',
      },
      // The page tours: one per page, started from the robot's "Rondleiding
      // door deze pagina". The step ids match pageTours in
      // src/components/Tutorial/tutorialSteps.js.
      pages: {
        // The warehouse tour (pageTours.warehouse in tutorialSteps.js).
        warehouse: {
          welcome: {
            title: 'Welkom in het magazijn',
            text: 'Een korte rondleiding door het magazijn. Het duurt ongeveer een minuut; je kunt altijd stoppen.',
            points: [
              'Een pakket scannen en stap voor stap afhandelen',
              'Een intakeformulier starten voor goederen die binnenkomen',
              'Alle pakketten zien die in het magazijn staan',
            ],
          },
          scan: {
            title: 'Pakket scannen',
            text: 'Begin hier als er een doos binnenkomt of als je er een oppakt. Scan de barcode of QR-code op het label met de camera, of typ het trackingnummer.',
          },
          package: {
            title: 'De pagina van het pakket',
            text: 'Na het scannen opent het pakket. Werk van boven naar beneden:',
            points: [
              'Controleren: vergelijk de gegevens met het label',
              'Meten: gewicht, lengte, breedte en hoogte',
              'Al gemeten op het intakeformulier? Dan sla je Meten over',
              'Klaar: markeer het als klaar voor verzending',
              'Daar meld je ook schade (met foto\'s) en sluit je die af, en print je het label',
            ],
          },
          newSheet: {
            title: 'Nieuw intakeformulier',
            text: 'Voor goederen die binnenkomen zonder code om te scannen, of een levering van meerdere dozen. Dit opent een leeg intakeformulier.',
          },
          intake: {
            title: 'Het intakeformulier',
            text: 'Stap voor stap (of kies bovenaan "Hele formulier"). Volgende slaat je werk op:',
            points: [
              'Zending: het zendingnummer staat vast; scan het label en tik de namen in Afzender, Ontvanger, ...',
              'Schade aanwezig? Ja: maak foto\'s van de schade',
              'Meten: één regel per soort doos. Dit telt ook voor het pakket, je meet maar één keer',
              'Vrijgeven en het team mailen als alles is ingevuld',
            ],
            note: 'Concept opslaan bewaart je werk; er wordt niets verstuurd tot je het vrijgeeft.',
          },
          list: {
            title: 'Pakketten in het magazijn',
            text: 'De pakketten van het gekozen vak, oudste eerst. Tik op een pakket om de pagina te openen; een gekleurd label zegt waarom het aandacht nodig heeft. Het zoekvak zoekt in alle pakketten, ook die al vertrokken zijn.',
          },
          filters: {
            title: 'De cijfers',
            text: 'Hoeveel pakketten er in het magazijn zijn, hoeveel aandacht nodig hebben, klaar zijn voor verzending en onderweg zijn. Tik op een vak om die pakketten in de lijst eronder te zien.',
          },
          menu: {
            title: 'Het menu',
            text: 'Links in beeld, of onderaan op een telefoon:',
            points: [
              'Home: deze pagina',
              'Scannen: de scanner',
              'Intakeformulieren: alle intakeformulieren, ook eerdere',
              'Profiel: je gegevens, pincode en overdrachtsmails',
            ],
          },
          help: {
            title: 'Wil je dit nog eens zien?',
            text: 'Druk op Uitleg om deze rondleiding opnieuw te starten.',
          },
        },
        // The office dashboard tour (pageTours.dashboard in tutorialSteps.js).
        dashboard: {
          welcome: {
            title: 'Welkom in het dashboard',
            text: 'Een korte rondleiding door het kantoordashboard. Het duurt ongeveer een minuut; je kunt altijd stoppen.',
            points: [
              'Waar je nieuwe aanvragen, boekingen en berichten vindt',
              'Hoe je zendingen, facturen en klanten beheert',
              'Waar je deze uitleg later terugvindt',
            ],
          },
          overview: {
            title: 'Overzicht',
            text: 'Begin hier elke dag. Je ziet wat er wacht, de cijfers van de gekozen periode en wat het magazijn meldt. Rood (schade, aandacht nodig) eerst oppakken.',
          },
          sales: {
            title: 'Verkoop',
            text: 'Het werk dat binnenkomt via de website:',
            points: [
              'Offertes: aanvragen van de bestemmingspagina\'s. Zet de status op Offerte verstuurd, Geaccepteerd of Afgewezen',
              'Boekingen: vul verzendnummer, volume en gewicht in, en bevestig of markeer als Verzonden',
              'Berichten: beantwoord per e-mail en markeer dan als afgehandeld',
            ],
            note: 'Het getal naast een menu-item is hoeveel er nog wacht.',
          },
          shipments: {
            title: 'Zendingen',
            text: 'Pakketten: zet elk pakket door de stappen, van Offerte verstuurd en Betaald tot Afgeleverd. Bij In transit en Afgeleverd wordt de datum vanzelf ingevuld. Metingen: wat het magazijn gemeten en gewogen heeft.',
          },
          billing: {
            title: 'Facturatie',
            text: 'Een factuur ontstaat vanzelf als een pakket op Betaald gaat. Controleer hem en keur goed (dan krijgt de klant hem) of keur af met een reden. Bij Documenten staan de bonnen en formulieren die klanten uploaden.',
          },
          people: {
            title: 'Mensen',
            text: 'Iedereen met een account:',
            points: [
              'Klanten: zoeken, gegevens verbeteren, een account openen of verwijderen',
              'Medewerkers: collega\'s, hun rol, en inlogcodes voor het magazijn',
              'Magazijntoegang en Vloerapparaten: wat het magazijn mag zien, en de gedeelde telefoons en scanners',
            ],
            note: 'Alleen een beheerder kan rollen wijzigen en accounts verwijderen.',
          },
          website: {
            title: 'Website',
            text: 'Winkels en blog. Wat je hier opslaat, staat meteen live op de website. Een blogbericht blijft verborgen tot je Gepubliceerd aanvinkt.',
          },
          warehouse: {
            title: 'Magazijn',
            text: 'Deze links openen de magazijn-app: scannen, intakeformulieren en de pagina van elk pakket. Die heeft een eigen rondleiding.',
          },
          search: {
            title: 'Zoeken',
            text: 'Zoek in de lijst waar je bent: een naam, e-mail of trackingnummer. Een volledig trackingnummer (of een scan) opent dat pakket meteen.',
          },
          foot: {
            title: 'Jouw account',
            text: 'Hier staat met welk account en welke rol je bent ingelogd, met links naar het Django-beheer, terug naar de website, en Uitloggen.',
          },
          help: {
            title: 'Wil je dit nog eens zien?',
            text: 'Druk op Uitleg in de bovenbalk. Op elke andere pagina legt Uitleg die pagina uit.',
          },
        },
        // The Customers page tour (pageTours.dashboardCustomers).
        dashboardCustomers: {
          intro: {
            title: 'Klanten',
            text: 'Iedereen die met ons verstuurt. Dit zijn dezelfde gegevens die de klant op zijn eigen profielpagina ziet: wat je hier verbetert, ziet de klant ook.',
          },
          filters: {
            title: 'Zoeken en filteren',
            text: 'Zoek op naam, e-mail, telefoon of plaats. Met Account kies je actieve of gewiste accounts; met Rol zie je ook collega\'s.',
          },
          create: {
            title: 'Nieuw account',
            text: 'Open een account voor iemand. Je vult naam, e-mail en telefoon in; de klant krijgt een e-mail om zelf een wachtwoord te kiezen. Jij ziet dat wachtwoord nooit.',
          },
          table: {
            title: 'De tabel',
            text: 'Per klant zie je contactgegevens, adressen, zendingen en wat betaald en nog open is.',
            points: [
              'Edit details: naam, e-mail, telefoon en adressen verbeteren',
              'Role: kies een andere rol, het wordt meteen opgeslagen',
            ],
          },
          delete: {
            title: 'Een account verwijderen',
            text: 'Met de rode knop Delete helemaal rechts. Zonder zendingen verdwijnt het account helemaal. Met zendingen worden alleen de persoonsgegevens gewist; de zendingen en facturen blijven bewaard.',
            note: 'Dit kan niet ongedaan worden gemaakt.',
          },
        },
        // The Invoices page tour (pageTours.dashboardInvoices).
        dashboardInvoices: {
          intro: {
            title: 'Facturen',
            text: 'Een factuur verschijnt hier vanzelf zodra een pakket op Betaald wordt gezet. Elke factuur moet eerst goedgekeurd worden voordat de klant hem ziet.',
          },
          filters: {
            title: 'Zoeken en filteren',
            text: 'Zoek op klant, factuurnummer of trackingnummer. Met Status zie je bijvoorbeeld alleen wat op controle wacht; met Klant alleen de facturen van één klant.',
          },
          table: {
            title: 'De lijst',
            text: 'Per factuur: nummer, klant, zending, datum, bedrag en status. Facturen die op controle wachten zijn gemarkeerd.',
            points: [
              'Pending review: jij moet hem nakijken',
              'Approved: klaar, de klant ziet hem nog niet',
              'Rejected: de reden staat eronder',
              'Sent: staat op de profielpagina van de klant',
            ],
          },
          review: {
            title: 'Nakijken',
            text: 'Klik op View om de factuur te openen en controleer regels, bedragen en klant.',
            points: [
              'Approve: de PDF wordt gemaakt en de factuur komt op het profiel van de klant',
              'Reject: schrijf erbij wat er mis is, zodat het verbeterd kan worden',
              'Send to customer: voor een goedgekeurde factuur die al een document heeft',
            ],
            note: 'Er wordt bijgehouden wie elke factuur goed- of afkeurde, en wanneer.',
          },
          new: {
            title: 'Nieuwe factuur',
            text: 'Schrijf zelf een factuur in de factuur-editor, bijvoorbeeld voor een zending die nooit via Betaald is gegaan.',
          },
          upload: {
            title: 'PDF uploaden',
            text: 'Heb je de factuur al als PDF? Upload hem hier. Uploaden keurt de factuur goed op jouw naam en zet hem op het profiel van de klant.',
          },
          settings: {
            title: 'Instellingen',
            text: 'De lijsten waaruit de factuur-editor kiest: havens en soorten kosten (zoals vracht, verzekering, afhandeling). Alleen een beheerder kan ze wijzigen.',
          },
        },
        // The Quotes page tour (pageTours.dashboardQuotes).
        dashboardQuotes: {
          intro: {
            title: 'Offerteaanvragen',
            text: 'Aanvragen die bezoekers via de bestemmingspagina\'s sturen. Wat de bezoeker stuurde kun je niet wijzigen, alleen de status.',
          },
          filters: {
            title: 'Zoeken en filteren',
            text: 'Zoek op naam, e-mail of bestemming. Met Status zie je bijvoorbeeld alleen de nieuwe aanvragen.',
          },
          table: {
            title: 'De lijst',
            text: 'Nieuwe aanvragen zijn gemarkeerd. Klik op een naam om de hele aanvraag en het bijgevoegde document te lezen.',
          },
          open: {
            title: 'Afhandelen',
            text: 'Stuur de offerte per e-mail en zet daarna de status:',
            points: [
              'New: nog niet bekeken',
              'Quote sent: offerte verstuurd',
              'Accepted of Declined: wat de klant besloot',
            ],
          },
        },
        // The Bookings page tour (pageTours.dashboardBookings).
        dashboardBookings: {
          intro: {
            title: 'Boekingen',
            text: 'Boekingsformulieren van de website. Wat de afzender invulde is alleen-lezen; verzendnummer, volume, gewicht en de verpakkingscontrole vul jij in.',
          },
          filters: {
            title: 'Zoeken en filteren',
            text: 'Zoek op verzendnummer, afzender, ontvanger of inhoud.',
          },
          table: {
            title: 'De lijst',
            text: 'Nieuwe boekingen zijn gemarkeerd. Open een boeking om de gegevens te zien en jouw velden in te vullen.',
          },
          status: {
            title: 'De status',
            text: 'Zo loopt een boeking:',
            points: [
              'Confirmed: gaat bij de klant van "Mijn boekingen" naar "Mijn zendingen"',
              'Shipped: de zending staat bij de klant als "Onderweg"',
              'Cancelled: geannuleerd',
            ],
          },
        },
        // The Messages page tour (pageTours.dashboardMessages).
        dashboardMessages: {
          intro: {
            title: 'Berichten',
            text: 'Alles wat via het contactformulier binnenkomt.',
          },
          filters: {
            title: 'Zoeken en filteren',
            text: 'Zoek op naam, e-mail of onderwerp. Met Handled zie je alleen wat nog niet is afgehandeld.',
          },
          table: {
            title: 'Afhandelen',
            text: 'Open een bericht en antwoord per e-mail. Zet het daarna op Mark handled, zodat je collega\'s weten dat het klaar is.',
            note: 'Afgehandeld markeren stuurt niets naar de klant.',
          },
        },
        // The Packages page tour (pageTours.dashboardPackages).
        dashboardPackages: {
          intro: {
            title: 'Pakketten',
            text: 'De zendingen van alle klanten. Nieuwe pakketten maak je in het Django-beheer.',
          },
          filters: {
            title: 'Zoeken en filteren',
            text: 'Zoek op trackingnummer, omschrijving of klant, en filter op status. Een volledig trackingnummer in de bovenbalk opent het pakket meteen.',
          },
          table: {
            title: 'De lijst',
            text: 'Per pakket: tracking, klant, bestemming, gewicht en waarde, data en status. Pakketten die op jou wachten zijn gemarkeerd. History toont wie wat deed.',
          },
          status: {
            title: 'De status wijzigen',
            text: 'Kies de nieuwe status in de lijst van het pakket:',
            points: [
              'Quote sent, Paid (er komt vanzelf een factuur), Products purchased',
              'Ready for shipping, In transit, Arrived at destination, Delivered',
              'Bij In transit en Delivered wordt de datum vanzelf ingevuld',
            ],
            note: 'Een pakket dat vertrokken is kan niet meer gewijzigd worden; een latere aankoop gaat op een nieuwe zending.',
          },
        },
        // The Measurements page tour (pageTours.dashboardMeasurements).
        dashboardMeasurements: {
          intro: {
            title: 'Metingen',
            text: 'Wat het magazijn gemeten en gewogen heeft, per intakeformulier.',
          },
          filters: {
            title: 'Zoeken en filteren',
            text: 'Zoek op referentie, leverancier, afzender of bestemming, en filter op status en vracht (zee of lucht).',
          },
          table: {
            title: 'De lijst',
            text: 'Per formulier: regels, colli, m³, gewicht en het belastbaar gewicht. Totalen tellen alleen volledige regels. Open een formulier om regels te wijzigen.',
          },
        },
        // The Documents page tour (pageTours.dashboardDocuments).
        dashboardDocuments: {
          intro: {
            title: 'Documenten',
            text: 'Wat klanten op hun profielpagina uploaden: bonnen, facturen van de winkel, douaneformulieren.',
          },
          filters: {
            title: 'Zoeken en filteren',
            text: 'Zoek op klant, notitie, bestandsnaam of trackingnummer. Met Kind kies je het soort document; met Filed zie je wat nog aan geen zending hangt.',
          },
          table: {
            title: 'Koppelen aan een zending',
            text: 'Een document kan binnenkomen voordat het pakket er is. Kies in de kolom Shipment de juiste zending zodra het pakket geboekt is.',
          },
        },
        // The Workers page tour (pageTours.dashboardWorkers).
        dashboardWorkers: {
          intro: {
            title: 'Medewerkers',
            text: 'Iedereen die hier werkt, gegroepeerd per rol. De rol bepaalt wie het dashboard, de magazijnscanner of geen van beide kan openen.',
          },
          new: {
            title: 'New colleague',
            text: 'Maak een account voor een collega en kies de rol. Ze krijgen een e-mail om zelf een wachtwoord te kiezen.',
            note: 'Alleen een beheerder ziet deze knop.',
          },
          code: {
            title: 'Send sign-in code',
            text: 'Stuur een magazijnmedewerker een code van vier cijfers. Die werkt één keer, 15 minuten lang. Daarna kiest de medewerker een eigen PIN voor de vloerapparaten.',
          },
          table: {
            title: 'De lijst',
            text: 'Per medewerker: gegevens, rol en de PIN-status.',
            points: [
              'PIN set, No PIN of PIN locked',
              'Reset PIN: voor een vergeten of geblokkeerde PIN; stuur daarna een nieuwe code',
              'Role: alleen een beheerder kan rollen wijzigen',
            ],
          },
        },
        // The WarehouseAccess page tour (pageTours.dashboardWarehouseAccess).
        dashboardWarehouseAccess: {
          intro: {
            title: 'Magazijntoegang',
            text: 'Wat magazijnmedewerkers in de magazijn-app mogen zien en gebruiken. Kantoor en beheerders worden nooit beperkt.',
          },
          switches: {
            title: 'Aan en uit',
            text: 'Zet een onderdeel uit en het verdwijnt van hun schermen; de server weigert het ook. Scannen, de pakketlijst en de pakketpagina blijven altijd aan.',
            note: 'Alleen een beheerder kan dit wijzigen.',
          },
        },
        // The FloorDevices page tour (pageTours.dashboardFloorDevices).
        dashboardFloorDevices: {
          intro: {
            title: 'Vloerapparaten',
            text: 'Gedeelde telefoons en scanners waarop een magazijnmedewerker inlogt door zijn naam te tikken en zijn PIN te typen. Een PIN werkt alleen op deze apparaten.',
          },
          register: {
            title: 'Register this device',
            text: 'Open deze pagina op het apparaat zelf, geef het een naam (bijvoorbeeld "Telefoon inpaktafel") en registreer het.',
          },
          table: {
            title: 'Apparaten',
            text: 'Alle geregistreerde apparaten. Klik op Revoke bij een apparaat dat kwijt of kapot is; daarna werkt een PIN er niet meer.',
          },
          log: {
            title: 'Wie logde waar in',
            text: 'Wie op welk apparaat inlogde en wanneer. Handig als iemand anders onder iemands naam lijkt te werken.',
          },
        },
        // The Shops page tour (pageTours.dashboardShops).
        dashboardShops: {
          intro: {
            title: 'Winkels',
            text: 'De webwinkels op de dienstenpagina. Wat je opslaat staat meteen live.',
          },
          add: {
            title: 'Winkel toevoegen',
            text: 'Vul naam, link, beschrijving en logo in en sla op.',
          },
          table: {
            title: 'De lijst',
            text: 'Wijzig een winkel in de tabel zelf.',
            points: [
              '↑: zet een winkel hoger in de volgorde',
              'Shown: uitvinken verbergt hem van de website zonder hem te verwijderen',
            ],
          },
        },
        // The Blog page tour (pageTours.dashboardBlog).
        // Added 2026-10: the pages that had no tour yet (tutorialSteps.js).
        calculator: {
          intro: {
            title: "Verzendcalculator",
            text: "Vul in waar het heen gaat, wat het kostte, de afmetingen en het gewicht, en zee- of luchtvracht. U ziet meteen een indicatie van de kosten.",
          },
          result: {
            title: "Het resultaat",
            text: "Elke kostenpost verschijnt zodra de prijs bekend is. Wilt u een vaste prijs? Vraag een offerte aan onder het resultaat; uw gegevens zijn al ingevuld.",
          },
        },
        forgotPassword: {
          intro: {
            title: "Wachtwoord vergeten?",
            text: "Vul het e-mailadres van uw account in en we sturen u een link om een nieuw wachtwoord te kiezen.",
          },
          next: {
            title: "Daarna",
            text: "Open de e-mail en klik binnen een uur op de link. Geen e-mail? Kijk in uw spammap of probeer het over een paar minuten opnieuw.",
          },
        },
        resetPassword: {
          intro: {
            title: "Kies een nieuw wachtwoord",
            text: "Typ uw nieuwe wachtwoord twee keer. Gebruik minstens 12 tekens en geen wachtwoord dat u ergens anders gebruikt.",
          },
          next: {
            title: "Daarna",
            text: "U bent voor de veiligheid overal uitgelogd. Log in met uw nieuwe wachtwoord.",
          },
        },
        twoFactor: {
          intro: {
            title: "Code uit uw app",
            text: "Typ na uw wachtwoord de code van zes cijfers uit uw authenticator-app. De eerste keer scant u een QR-code om het in te stellen.",
          },
          lost: {
            title: "Telefoon kwijt?",
            text: "Typ dan een van uw herstelcodes. Geen codes meer? Vraag een beheerder om uw tweestapsverificatie te resetten.",
          },
        },
        warehouseScan: {
          intro: {
            title: "Scanner",
            text: "Richt de camera op de code op de doos, of typ de code als het etiket beschadigd is.",
          },
          result: {
            title: "Wat u krijgt",
            text: "Een verwacht pakket scannen ontvangt het automatisch. Open het daarna om te meten, te verpakken en klaar te zetten.",
          },
        },
        warehousePackage: {
          intro: {
            title: "Het pakket",
            text: "Controleer de gegevens met het etiket op de doos voor u.",
          },
          steps: {
            title: "Stap voor stap",
            text: "Meet het, voeg de verpakking toe en markeer het als verpakt. De pagina laat zien bij welke stap u bent.",
          },
          automatic: {
            title: "De status gaat vanzelf",
            text: "Scannen ontvangt het, meten zet het door, en als het verpakt is zonder open punten wordt het Klaar voor verzending. Gebruik Verplaats naar alleen om een fout te herstellen.",
          },
          extra: {
            title: "Foto's en geschiedenis",
            text: "Maak foto's voor de klant, meld schade, en open onderaan de geschiedenis en alle gegevens.",
          },
        },
        warehouseIntake: {
          intro: {
            title: "Intakeformulier",
            text: "Het formulier voor goederen die binnenkomen, in dezelfde volgorde als het papieren formulier.",
          },
          release: {
            title: "Overdragen",
            text: "Is het formulier compleet? Geef het vrij: het kantoor krijgt het en de zending kan gefactureerd worden.",
          },
        },
        warehouseProfile: {
          intro: {
            title: "Uw pagina",
            text: "Als wie u bent ingelogd, wat u heeft overgedragen en de formulieren die nog op u wachten.",
          },
          tools: {
            title: "Handige hulpmiddelen",
            text: "De calculator, de instelling voor de overdrachtsmail en uw wachtwoord staan hier ook.",
          },
        },
        warehousePin: {
          intro: {
            title: "Uw pincode",
            text: "Kies een pincode van 4 cijfers. Daarmee logt u in op de magazijnapparaten door op uw naam te tikken.",
          },
        },
        dashboardInvoiceEditor: {
          intro: {
            title: "Factuureditor",
            text: "Kies de klant en de zending en vul de kosten in. De totalen worden voor u berekend.",
          },
          preview: {
            title: "Voorbeeld",
            text: "De factuur rechts is precies wat er wordt afgedrukt. Download of print hem met de knoppen onder het formulier.",
          },
          save: {
            title: "Opslaan",
            text: "Sla hem op voor controle, of stuur hem meteen naar de klant.",
          },
        },
        dashboardInvoiceSettings: {
          intro: {
            title: "Factuurinstellingen",
            text: "Bedrijfsgegevens, bankgegevens en teksten die op elke factuur staan. Een wijziging geldt voor facturen die u vanaf nu maakt.",
          },
        },
        dashboardPreAlerts: {
          intro: {
            title: "Vooraanmeldingen",
            text: "Pakketten waarvan klanten zeiden dat ze onderweg zijn naar ons magazijn.",
          },
          filters: {
            title: "Zoeken en filteren",
            text: "Zoek op referentie, trackingnummer, klant of winkel, of filter op status.",
          },
        },
        dashboardCourierTracking: {
          intro: {
            title: "Koerier volgen",
            text: "Alle koeriersnummers: inkomend naar ons magazijn en uitgaand naar het eiland.",
          },
          filters: {
            title: "Zoeken en filteren",
            text: "Zoek op trackingnummer, klant of winkel, of toon alleen problemen.",
          },
          details: {
            title: "Een zending openen",
            text: "Klik op een trackingnummer: u ziet wat de klant ziet, kunt een update toevoegen, een foute corrigeren of het nummer zelf corrigeren.",
          },
        },
        dashboardSecurity: {
          intro: {
            title: "Beveiliging",
            text: "Bepaal of tweestapsverificatie uit, optioneel of verplicht is.",
          },
          modes: {
            title: "De standen",
            text: "Stel het eerst in op uw eigen account. Opslaan vraagt uw wachtwoord en laat zien wie het raakt.",
          },
          history: {
            title: "Geschiedenis",
            text: "Elke wijziging aan tweestapsverificatie staat onderaan.",
          },
        },
        driver: {
          intro: {
            title: "Uw leveringen",
            text: "De zendingen die afgeleverd moeten worden, met de telefoon en het adres van de klant één tik verderop.",
          },
          deliver: {
            title: "Afgeleverd",
            text: "Tik op Afgeleverd, vul in wie het aannam en maak zo mogelijk een foto. Vandaag laat zien wat u heeft afgeleverd.",
          },
        },
        dashboardBlog: {
          intro: {
            title: 'Blog',
            text: 'De berichten op het blog van de website.',
          },
          new: {
            title: 'New post',
            text: 'Schrijf een nieuw bericht. Laat Published uit zolang het een concept is; concepten zijn verborgen voor bezoekers.',
          },
          table: {
            title: 'De lijst',
            text: 'Klik op een bericht om het te bewerken. Vink Published aan en sla op: het staat dan meteen op /blog.',
          },
        },
        faq: {
          topics: { title: 'De onderwerpen', text: 'Klik op een onderwerp, zoals "Auto verschepen" of "Betalen", om de vragen en antwoorden te zien. Klik nog een keer om het weer te sluiten.' },
          important: { title: 'Documenten voor de douane', text: 'Lees dit voordat u iets verstuurt: zonder de juiste documenten kunnen wij uw goederen niet verzenden.' },
          more: { title: 'Vraag niet gevonden?', text: 'Neem contact met ons op, wij helpen u graag.' },
        },
        blog: {
          intro: { title: 'Het blog', text: 'Hier schrijven wij tips en uitleg over bestellen en verzenden naar de eilanden.' },
          posts: { title: 'De berichten', text: 'Klik op een bericht om het helemaal te lezen.' },
        },
        blogPost: {
          article: { title: 'Het bericht', text: 'Bovenaan staan de datum en een korte samenvatting, daaronder het hele bericht.' },
          cta: { title: 'Klaar om te verzenden?', text: 'Bekijk de bestemmingen of neem contact met ons op.' },
          back: { title: 'Meer lezen', text: 'Met deze link gaat u terug naar alle berichten.' },
        },
        terms: {
          note: { title: 'In het Engels', text: 'De voorwaarden staan in het Engels. Bij een verschil met de Nederlandse tekst is de Nederlandse tekst beslissend.' },
          contents: { title: 'Inhoud', text: 'Klik op een artikel om er direct naartoe te gaan.' },
          conditions: { title: 'De voorwaarden', text: 'Eerst de expeditievoorwaarden, die gelden voor elke zending. Daarna de opslagvoorwaarden, voor opslag in ons magazijn.' },
          contact: { title: 'Vragen?', text: 'Begrijpt u iets niet? Neem contact met ons op.' },
        },
        privacy: {
          intro: { title: 'Uw gegevens', text: 'Hier leest u welke gegevens wij verzamelen, waarom, met wie wij ze delen en hoe lang wij ze bewaren.' },
          contact: { title: 'Vragen over uw gegevens?', text: 'Neem contact met ons op als u een vraag heeft over uw gegevens.' },
        },
        services: {
          intro: { title: 'Onze diensten', text: 'Op deze pagina leest u wat wij voor u doen, van ons magazijn in Nederland tot de aflevering op het eiland.' },
          islands: { title: 'De eilanden', text: 'Klik op een eiland om te zien hoe verzenden daarheen werkt, hoe lang het duurt en om een offerte aan te vragen.' },
          offer: { title: 'Wat wij voor u doen', text: 'Zeevracht en luchtvracht, het ontvangen en samenvoegen van uw pakketten, de douane en de aflevering op het eiland.' },
          partners: { title: 'Onze partners', text: 'De bedrijven waarmee wij samenwerken om uw zending op het eiland te krijgen.' },
          contact: { title: 'Nog vragen?', text: 'Wilt u weten wat wij voor u kunnen doen? Met deze knop neemt u contact met ons op.' },
        },
        booking: {
          intro: { title: 'De boekingsbon', text: 'Hier meldt u uw zending bij ons aan, in plaats van op papier. Het shippingnummer, het volume en het gewicht vullen wij aan zodra uw zending bij ons is.' },
          mode: { title: 'Normaal of stap voor stap', text: 'Kies "Normaal formulier" om alles op één pagina in te vullen, of "Stap voor stap" om één onderdeel tegelijk te doen. Wat u al heeft ingevuld blijft staan als u wisselt.' },
          shipment: { title: 'Uw zending', text: 'Kies hoe u verstuurt (zeevracht of luchtvracht) en naar welke bestemming.' },
          people: { title: 'Afzender en ontvanger', text: 'Vul hier uw eigen gegevens in, en daaronder die van de ontvanger op het eiland.' },
          consignment: { title: 'Wat u verstuurt', text: 'Kies per winkel waar u heeft besteld en wat u daar heeft gekocht, eventueel met een screenshot van uw bestelling.' },
          insurance: { title: 'Verzekering en opmerkingen', text: 'Wilt u de zending verzekeren? Vul dan de waarde in; met "Hoe werkt de verzekering?" ziet u wat het kost. Hier kunt u ook iets opmerken voor ons.' },
          terms: { title: 'Voorwaarden en ondertekenen', text: 'Ga akkoord met de voorwaarden, zet uw naam als handtekening en verstuur de boekingsbon.' },
        },
        contact: {
          methods: { title: 'Zo bereikt u ons', text: 'Mail of bel ons, of kom langs. Klik op een van de drie om direct te mailen, te bellen of de route te zien.' },
          form: { title: 'Stuur ons een bericht', text: 'Liever schrijven? Vul dit formulier in. Wij antwoorden per e-mail.' },
        },
        destinations: {
          list: { title: 'Kies uw eiland', text: 'Klik op een eiland. Daar leest u hoe lang verzenden duurt, hoe het werkt, en kunt u een offerte aanvragen.' },
        },
        destination: {
          facts: { title: 'In het kort', text: 'Hoe lang de overtocht duurt, waar uw zending aankomt en hoe de aflevering gaat.' },
          how: { title: 'Zo komt uw bestelling aan', text: 'Stap voor stap: van uw bestelling in Nederland tot de aflevering op dit eiland.' },
          faq: { title: 'Veelgestelde vragen', text: 'Antwoorden op wat mensen het vaakst vragen over verzenden naar dit eiland. Klik op een vraag om het antwoord te lezen.' },
          quote: { title: 'Vraag een offerte aan', text: 'Vul uw naam en e-mailadres in, upload uw factuur en verstuur de aanvraag. Wij mailen u een indicatieve prijs.' },
        },
        profile: {
          details: { title: 'Uw gegevens', text: 'Uw naam, e-mailadres, telefoonnummer en afleveradres. Houd ze actueel, zodat wij u kunnen bereiken.' },
          address: { title: 'Uw verzendadres', text: 'Dit adres vult u bij élke bestelling in een webshop in als afleveradres, zodat het pakket naar ons magazijn komt. Vul bij "voornaam" uw eigen voornaam in en bij "achternaam" "Pay less Shop More". Met het knopje naast een regel kopieert u die regel, of kopieer het hele adres in één keer.' },
          tracking: { title: 'Track & Trace', text: 'Volg hier uw zending. De informatie verschijnt zodra die voor uw zending beschikbaar is.' },
          shipments: { title: 'Mijn zendingen', text: 'Al uw zendingen op een rij, met waar elke zending nu is.' },
          prealert: { title: 'Een pakket vooraanmelden', text: 'Is er een pakket onderweg naar ons magazijn? Meld het hier aan met het trackingnummer, de koerier, de winkel en wat erin zit. Een aangegeven waarde is niet meer nodig. Voeg de factuur van de winkel toe, dan gaat de douane sneller.' },
          handover: { title: 'Bezorgen of zelf ophalen', text: 'Klik op een zending en kies hoe u hem wilt ontvangen: "Bezorgen" of "Zelf ophalen". U kiest maar één keer: eerst vragen wij of u het zeker weet, daarna staat de keuze vast. Wilt u het later toch wijzigen? Klik in de zending op ons e-mailadres; het onderwerp met uw zendingnummer staat er al in.' },
          bookings: { title: 'Mijn boekingen', text: 'Alles wat u via de boekingsbon heeft aangemeld. Klik op een boeking om te zien wat u heeft ingevuld.' },
          invoices: { title: 'Mijn facturen', text: 'Hier vindt u onze facturen voor uw zendingen, om te bekijken of te downloaden.' },
          notifications: { title: 'Meldingen', text: 'Kies welke e-mails u van ons wilt ontvangen.' },
        },
        prealert: {
          intro: { title: 'Pakket vooraanmelden', text: 'Is er een pakket onderweg naar ons magazijn? Meld het hier aan. Zo weten wij dat het van u is zodra het binnenkomt. Velden met een * zijn verplicht.' },
          courier: { title: 'Trackingnummer en koerier', text: 'Het trackingnummer en het koeriersbedrijf (PostNL, DHL, DPD ...) staan in de verzendmail van de winkel. Daarmee volgen wij het pakket naar ons magazijn.' },
          shop: { title: 'De winkel', text: 'Kies de winkel waar u het kocht. Staat die er niet bij? Kies "Een andere winkel…" en typ de naam.' },
          description: { title: 'Wat zit erin?', text: 'Beschrijf kort wat er in het pakket zit, bijvoorbeeld "1 moederbord en 1 voeding". Een aangegeven waarde is niet nodig.' },
          receiver: { title: 'Ontvanger', text: 'Uw naam staat al ingevuld. Ontvangt iemand anders het pakket? Vul dan zijn of haar naam in.' },
          invoice: { title: 'De factuur', text: 'Voeg de factuur of orderbevestiging van de winkel toe: PDF of foto, tot 5 bestanden. Niet verplicht, maar de douane gaat er sneller door.' },
          confirm: { title: 'Bevestigen en versturen', text: 'Vink aan dat u de lijst met artikelen die wij niet verzenden heeft gelezen, en klik op "Vooraanmelding versturen". U vindt hem daarna in uw account bij "Mijn zendingen".' },
        },
        login: {
          form: { title: 'Inloggen', text: 'Vul het e-mailadres en het wachtwoord van uw account in.' },
          forgot: { title: 'Wachtwoord vergeten?', text: 'Klik hier. Wij mailen u een link om een nieuw wachtwoord te kiezen.' },
          signup: { title: 'Nog geen account?', text: 'Maak er hier gratis een aan. Dat duurt ongeveer een minuut.' },
        },
        signup: {
          form: { title: 'Uw gegevens', text: 'Vul uw eigen naam, e-mailadres en telefoonnummer in.' },
          password: { title: 'Kies een wachtwoord', text: 'Kies een sterk wachtwoord. Met het oogje kunt u zien wat u typt.' },
          terms: { title: 'Akkoord en klaar', text: 'Ga akkoord met de voorwaarden en klik op de knop om uw account aan te maken.' },
        },
        tutorial: {
          player: { title: 'De uitleg, stap voor stap', text: 'Ga met "Volgende" en "Vorige" door de stappen. Met "Lees voor" leest de robot de stap voor.' },
          written: { title: 'Alles op een rij', text: 'Dezelfde stappen onder elkaar, om rustig na te lezen of uit te printen.' },
          cta: { title: 'Klaar om te beginnen?', text: 'Meld uw zending aan, of neem contact met ons op als u nog vragen heeft.' },
        },
      },
      helpButton: {
        label: 'Hulp',
        menuLabel: 'Hulp',
        pageTour: 'Rondleiding door deze pagina',
        shipping: 'Verzendinformatie',
        howToOrder: 'Zo bestelt u',
        track: 'Mijn pakket volgen',
        contact: 'Contact opnemen',
      },
    },
    tutorial: {
      eyebrow: 'UITLEG',
      title: 'Zo werkt het',
      breadcrumb: 'Uitleg',
      lead:
        'Onze assistent loopt stap voor stap met u mee: van uw account tot de aflevering op het eiland. Liever luisteren? Druk op "Lees voor".',
      playerLabel: 'Stapsgewijze uitleg',
      stepWord: 'Stap',
      previous: 'Vorige',
      next: 'Volgende',
      restart: 'Opnieuw',
      playVoice: 'Lees voor',
      stopVoice: 'Stop met voorlezen',
      voiceUnavailable:
        'Uw browser kan deze uitleg niet voorlezen. De volledige tekst staat hieronder.',
      writtenTitle: 'De uitleg op een rij',
      writtenLead:
        'Alle stappen achter elkaar, om rustig na te lezen of uit te printen.',
      address: {
        firstName: 'Voornaam',
        firstNameValue: 'Uw eigen voornaam',
        lastName: 'Achternaam',
        street: 'Adres',
      },
      ctaTitle: 'Klaar om te beginnen?',
      ctaBody:
        'Meld uw zending aan of stel ons uw vraag — wij denken met u mee.',
      ctaPrimary: 'Zending aanmelden',
      ctaSecondary: 'Neem contact op',
      steps: {
        account: {
          title: 'Maak een account aan',
          body:
            'Met een account ziet u uw zendingen, boekingen, adressen en facturen op één plek terug. Aanmelden kost een minuut en is gratis.',
          action: 'Account aanmaken',
        },
        quote: {
          title: 'Vraag een offerte aan',
          body:
            'Vertel ons wat u wilt versturen en naar welk eiland. U krijgt een indicatieve prijs op maat, op basis van gewicht en volume.',
          bullets: [
            'Kies uw bestemming: Aruba, Bonaire of Curaçao. Naar andere landen in het Caribisch gebied en Latijns-Amerika verzenden wij ook; die staan bij Bestemmingen.',
            'Geef zo goed mogelijk door wat u verstuurt en hoe groot het is.',
            'Wij sturen u de prijs en de verzendmogelijkheden per e-mail.',
          ],
          action: 'Offerte aanvragen',
        },
        order: {
          title: 'Bestel bij de winkel van uw keuze',
          body:
            'Plaats uw bestelling bij vrijwel elke Nederlandse webshop. U bestelt zelf, met uw eigen account bij die winkel.',
          note: 'Rond de betaling direct af. Achteraf betalen is niet toegestaan.',
          action: 'Bekijk onze diensten',
        },
        invoice: {
          title: 'Gebruik ons adres als afleveradres',
          body:
            'Vul bij het afrekenen ons magazijn in als afleveradres, precies zoals hieronder. Met uw eigen naam erbij weten wij van wie het pakket is zodra het binnenkomt. Het adres om te kopiëren staat ook in uw account, bij "Uw verzendadres".',
          note:
            'Let op: staat er een ander adres of een andere naam op het pakket, dan weten wij niet dat het van u is.',
        },
        announce: {
          title: 'Meld uw zending bij ons aan',
          body:
            'Meld het pakket vooraf aan in uw account: het trackingnummer, de koerier, de winkel en wat erin zit. Een aangegeven waarde is niet nodig. Voeg de factuur van de winkel toe, dan gaat de douane sneller.',
          action: 'Pakket vooraanmelden',
        },
        warehouse: {
          title: 'Wij ontvangen en verwerken uw pakket',
          body:
            'In ons magazijn in Berkel en Rodenrijs boeken wij uw pakket in, meten en wegen wij het en maken wij het verzendklaar. Losse pakketten kunnen wij samenvoegen tot één zending. Het gewicht, de afmetingen en foto\'s van uw pakket ziet u bij de zending in uw account.',
        },
        track: {
          title: 'Volg uw zending',
          body:
            'Zodra uw zending onderweg is, volgt u elke stap met Track & Trace in uw account.',
          action: 'Volg uw zending',
        },
        delivery: {
          title: 'Aflevering op het eiland',
          body:
            'Op de bestemming wordt uw zending afgeleverd of staat zij klaar om opgehaald te worden. U kiest zelf in uw account, bij de zending: "Bezorgen" of "Zelf ophalen". U kiest maar één keer; wilt u het daarna wijzigen, mail ons dan. Per bestemming leest u hoe het precies gaat.',
          action: 'Bekijk bestemmingen',
        },
      },
    },
    // The blog (src/pages/Blog). The articles themselves are written by the
    // office in the dashboard; these are only the page's own words.
    blog: {
      title: 'Blog',
      lead: 'Tips en uitleg over bestellen in Nederland en verzenden naar de eilanden.',
      empty: 'Er zijn nog geen berichten. Kom binnenkort terug!',
      readMore: 'Lees verder',
      back: 'Alle berichten',
      notFound: 'Bericht niet gevonden',
      notFoundText: 'Dit bericht bestaat niet (meer). Bekijk de andere berichten op de blog.',
      otherLanguage: 'Dit bericht is (nog) niet vertaald en staat hier in het',
      languages: { nl: 'Nederlands', en: 'Engels', pap: 'Papiaments' },
      ctaTitle: 'Klaar om te bestellen?',
      ctaQuote: 'Vraag een offerte aan',
      ctaContact: 'Neem contact op',
    },
    footer: {
      tagline:
        'Shop slimmer, bespaar meer. Vergelijk prijzen en vind de beste deals op één plek.',
      navigation: 'Navigatie',
      company: 'Bedrijf',
      legal: 'Juridisch',
      about: 'Over ons',
      blog: 'Blog',
      faq: 'Veelgestelde vragen',
      privacy: 'Privacybeleid',
      terms: 'Algemene voorwaarden',
      social: 'Sociale media',
      footerNav: 'Footernavigatie',
      rights: 'Alle rechten voorbehouden.',
      madeIn: 'Gemaakt in Nederland',
    },
  },

  en: {
    // The "Feedback" button on every page (components/Feedback).
    feedback: {
      button: 'Feedback',
      title: 'What do you think of our website?',
      intro: 'Give us a score and tell us what could be better. We read everything.',
      starsLabel: 'Your rating',
      star: '{count} out of 5 stars',
      comment: 'Your comment (optional)',
      commentPlaceholder: 'What went well, what could be better?',
      email: 'Your e-mail address (optional, if you would like an answer)',
      send: 'Send',
      sending: 'Sending…',
      cancel: 'Cancel',
      close: 'Close',
      chooseStars: 'Choose 1 to 5 stars first.',
      failed: 'Sending did not work. Please try again.',
      thanks: 'Thank you for your feedback!',
    },
    // "Factuur bekijken" on a shipment: the invoice and which products
    // reached the warehouse; see orderOverviewTranslations.js.
    orderOverview: orderOverviewTranslations.en,
    // The office and warehouse dashboards; see dashboardTranslations.js.
    dashboard: {
      ...dashboardTranslations.en,
      flow: warehouseFlowTranslations.en,
      // The office's own pages; see dashboardPageTranslations.js.
      pages: dashboardPageTranslations.en,
      // The invoice editor and its settings page; see invoiceTranslations.js.
      invoice: invoiceTranslations.en,
    },
    nav: {
      home: 'Home',
      services: 'Services',
      tutorial: 'How it works',
      tracking: 'Tracking',
      booking: 'Booking',
      calculator: 'Calculator',
      contact: 'Contact',
      label: 'Main navigation',
    },
    destinations: {
      label: 'Destinations',
      aruba: 'Aruba',
      bonaire: 'Bonaire',
      curacao: 'Curaçao',
      dominicanRepublic: 'Dominican Republic',
      saintMartin: 'Saint Martin',
      suriname: 'Suriname',
      other: 'Other destinations',
    },
    account: {
      login: 'Log in',
      signup: 'Sign up',
      logout: 'Log out',
      profile: 'My account',
    },
    notFound: {
      title: 'Page not found',
      body: 'This page does not exist, or it has moved.',
      home: 'Back to home',
    },
    menu: {
      open: 'Open menu',
      close: 'Close menu',
    },
    language: {
      label: 'Language',
      choose: 'Choose a language',
    },
    // The shipping calculator (pages/Calculator). Prices: src/calculator/rates.js.
    calculator: {
      title: 'Shipping cost calculator',
      summary:
        'Work out an indication of shipping costs to Curaçao: volume, chargeable weight, freight and import duty.',
      intro:
        'Enter what you are ordering and how big and heavy it is. You see the volume and chargeable weight straight away and, where rates are known, a price indication. Want an exact price? Request a quote with these details in one click.',
      formTitle: 'Price indication',
      destination: 'Destination',
      price: 'Price incl. VAT in euros',
      vat: 'VAT rate',
      dimensions: 'Dimensions',
      sides: { lengthCm: 'Length', widthCm: 'Width', heightCm: 'Height' },
      weight: 'Weight',
      grams: 'grams',
      category: 'Import category',
      chooseCategory: 'Choose a category',
      // One label per category in src/calculator/rates.js (same keys, same order).
      categories: {
        clothing: 'Clothing',
        shoes: 'Shoes',
        bags: 'Bags, suitcases and wallets',
        fashionJewellery: 'Fashion jewellery (not gold or silver)',
        preciousJewellery: 'Gold or silver jewellery',
        watches: 'Watches',
        cosmetics: 'Make-up, skin and hair care',
        perfume: 'Perfume and eau de toilette',
        computers: 'Laptops, computers and tablets',
        phones: 'Mobile phones',
        televisions: 'TVs and computer monitors',
        headphones: 'Headphones and earbuds',
        speakers: 'Speakers and amplifiers',
        smallAppliances: 'Small electrical appliances (kitchen, hair dryer, iron, vacuum cleaner)',
        furniture: 'Furniture (tables, cabinets, beds, mattresses)',
        seating: 'Chairs and sofas',
        lighting: 'Lamps',
        homeTextiles: 'Bed, table and kitchen linen',
        kitchenware: 'Steel pans and kitchenware',
        toys: 'Toys',
        gameConsoles: 'Game consoles',
        sports: 'Sports equipment',
        books: 'Books and magazines',
        other: 'Other',
      },
      transport: 'Transport method',
      transports: { air: 'Air freight', sea: 'Sea freight' },
      submit: 'Calculate',
      result: {
        title: 'Your indication',
        empty: 'Fill in the form and press Calculate.',
        priceInclVat: 'Price incl. VAT',
        vat: 'Dutch VAT ({percent}%)',
        goodsValue: 'Value without Dutch VAT',
        volume: 'Volume',
        actual: 'Actual weight',
        volumetric: 'Volumetric weight',
        chargeable: 'Chargeable weight (air freight)',
        freight: 'Freight ({method})',
        fees: {
          administration: 'Administration fee',
          documentation: 'Documentation fee',
          handling: 'Handling fee',
        },
        duty: 'Import duty ({percent}%)',
        localTax: {
          curacao: 'Sales tax (OB) {percent}%',
        },
        total: 'Total (indication)',
        notPriced:
          'We do not calculate the price for this route automatically yet. Request a quote and we will send you the price, with the details above already filled in.',
        partial:
          'Not every charge for this destination is known yet, so there is no total. The amounts above are what is known.',
        dutyNote:
          'Import duty is taken from the Curaçao customs tariff (Douane Curaçao). The exact rate depends on the goods code customs assign.',
        disclaimer:
          'This is an indication, not a quote. The final amount depends on what we measure and weigh when it arrives at our warehouse, and on customs on the island.',
      },
      quote: {
        button: 'Request a quote with these details',
        intro: 'Price indication requested through the calculator:',
      },
      errors: {
        priceInclVat: 'Enter a price above 0.',
        lengthCm: 'Enter a length above 0.',
        widthCm: 'Enter a width above 0.',
        heightCm: 'Enter a height above 0.',
        weightGrams: 'Enter a weight above 0.',
        category: 'Choose a category.',
      },
    },
    // The authenticator-app step of signing in (pages/TwoFactor/TwoFactorPage.jsx).
    twoFactor: {
      codeTitle: 'Code from your app',
      codeIntro: 'Open your authenticator app (e.g. Google or Microsoft Authenticator) and type the six-digit code for PayLesShopMore.',
      codeLabel: 'Code',
      backupHint: 'Lost your phone? Type one of your recovery codes.',
      verify: 'Confirm',
      checking: 'Checking…',
      setupTitle: 'Secure your account',
      setupIntro: 'You sign in with your password and a code from an app on your phone, so nobody gets in with your password alone. You set this up once.',
      step1: '1. Install an authenticator app and scan this QR code.',
      qrLabel: 'QR code for your authenticator app',
      cannotScan: 'Cannot scan? Enter this key in the app:',
      step2: '2. Type the code the app shows now.',
      codeHint: 'Six digits. The code changes every 30 seconds.',
      finishSetup: 'Finish setup',
      codesTitle: 'Save your recovery codes',
      codesIntro: 'Lost your phone? Each of these codes signs you in once. They are shown only this once: download them or write them down and keep them somewhere safe.',
      download: 'Download codes',
      codesFileTitle: 'PayLesShopMore recovery codes (each works once)',
      savedThem: 'I have saved these codes somewhere safe.',
      continue: 'Continue',
      wrongCode: 'That code is not right. Check the time on your phone and try the newest code.',
      locked: 'Too many wrong codes. Wait 15 minutes and try again.',
      offline: 'That did not work. Check the connection and try again.',
      signOut: 'Sign out',
    },
    // "Confirm it's you" before a sensitive admin action (components/ReauthDialog).
    reauth: {
      title: 'Confirm it is you',
      intro: 'This is a sensitive action. Type your password again to continue.',
      password: 'Password',
      code: 'Code from your authenticator app',
      confirm: 'Confirm',
      checking: 'Checking…',
      cancel: 'Cancel',
      wrongPassword: 'That password is not right.',
      wrongCode: 'That code is not right. Try the newest code.',
      locked: 'Too many attempts. Please try again later.',
      failed: 'That is not working right now. Please try again later.',
    },
    login: {
      breadcrumb: 'Log in',
      title: 'Log in',
      subtitle: 'Sign in to your account to manage your shipments.',
      email: 'E-mail address',
      password: 'Password',
      showPassword: 'Show password',
      hidePassword: 'Hide password',
      remember: 'Keep me signed in',
      forgot: 'Forgotten your password?',
      submit: 'Log in',
      submitting: 'Signing in…',
      noAccount: 'No account yet?',
      signupLink: 'Create one',
      methodLabel: 'How do you want to sign in?',
      methodPassword: 'Password',
      methodCode: 'Warehouse code',
      codeSubtitle:
        'Warehouse worker? Enter your e-mail address and the four-digit code an admin e-mailed you.',
      code: 'Code',
      codeHint: 'Four digits, from the e-mail.',
      errors: {
        emailRequired: 'Please enter your e-mail address.',
        emailInvalid: 'That e-mail address does not look right.',
        passwordRequired: 'Please enter your password.',
        // Deliberately vague: naming which half was wrong tells an attacker
        // whether the address exists.
        failed: 'E-mail address or password is incorrect.',
        offline: 'Signing in is not working right now. Please try again later.',
        tooMany: 'Too many attempts. Please try again in an hour.',
        codeRequired: 'Please enter the four-digit code.',
        codeInvalid: 'The code is exactly four digits.',
        // Deliberately vague, like `failed`: wrong, expired, used up and
        // not-a-warehouse-account all get this one sentence.
        codeFailed:
          'That code does not work. Check it, or ask an admin for a new one.',
      },
      // The "Who is working?" screen on a registered floor device, and the
      // page where a worker sets their PIN after an e-mailed code.
      floor: {
        title: 'Who is working?',
        subtitle: 'Tap your name and type your PIN.',
        device: 'Device: {name}',
        noWorkers: 'There are no warehouse workers on this device yet.',
        locked: 'Locked',
        noPin: 'No PIN yet',
        pinFor: 'PIN for {name}',
        pin: 'PIN',
        pinHint: 'Four digits.',
        notYou: '← Not you?',
        useCode: 'Sign in with an e-mailed code',
        usePassword: 'Office: sign in with a password',
        openList: 'Warehouse? Tap your name →',
        noPinHelp:
          'You have no PIN yet. Ask an admin to e-mail you a sign-in code, sign in with it, and then choose your PIN.',
        lockedHelp:
          'Your PIN is locked after too many wrong tries. Ask an admin to e-mail you a sign-in code, then choose a new PIN.',
        errors: {
          failed: 'That PIN is not right.',
          coolingOff: 'Too many wrong PINs on this device. Wait a few minutes.',
        },
      },
      setPin: {
        title: 'Choose your PIN',
        subtitle:
          'From now on this is how you sign in on the shared warehouse devices: tap your name and type four digits.',
        pin: 'New PIN',
        repeat: 'Repeat the PIN',
        hint: 'Four digits. Not 1234, 0000 or anything like it, and do not let anybody watch.',
        submit: 'Save PIN',
        saving: 'Saving…',
        later: 'Later',
        done: 'Your PIN is saved.',
        mustChange:
          'You signed in with a PIN from your manager. Choose your own PIN now - the warehouse opens once you have.',
        notAllowed:
          'You can only set your PIN straight after signing in with an e-mailed code.',
        errors: {
          invalid: 'A PIN is exactly four digits.',
          mismatch: 'The two PINs are not the same.',
          failed: 'The PIN could not be saved. Please try again.',
        },
      },
      notImplemented:
        'Log in is not connected yet: there is no server to send the details to.',
    },
    // The warehouse's own sign-in page (pages/Warehouse/WarehouseLogin.jsx).
    warehouseLogin: {
      title: 'Warehouse sign-in',
      subtitle: 'Sign in with your work e-mail address and your PIN.',
      email: 'E-mail address',
      pin: 'PIN',
      pinHint: 'Four digits. Do not let anybody watch.',
      submit: 'Sign in',
      forgotten: 'Forgotten your PIN, or is it locked? Ask your manager for a new one.',
      office: 'Office or admin?',
      officeLink: 'Sign in with a password',
      signedInAs: 'You are already signed in as {name}.',
      continueAs: 'Continue to the warehouse',
      switchToWorker: 'Sign in as a worker',
      errors: {
        failed: 'That e-mail address or PIN is not right.',
        tooMany: 'Too many tries. Wait a moment and try again.',
        email: 'Enter your e-mail address.',
        pin: 'A PIN is exactly four digits.',
      },
    },
    signup: {
      breadcrumb: 'Sign up',
      title: 'Create an account',
      subtitle: 'Create an account to track and manage your shipments.',
      firstName: 'First name',
      lastName: 'Last name',
      phone: 'Phone number',
      email: 'E-mail address',
      password: 'Password',
      confirm: 'Confirm password',
      showPassword: 'Show password',
      hidePassword: 'Hide password',
      passwordHint: 'At least 12 characters.',
      strength: {
        label: 'Password strength',
        weak: 'Weak',
        fair: 'Fair',
        good: 'Good',
        strong: 'Strong',
      },
      terms: 'I agree to the',
      termsLink: 'terms and conditions',
      and: 'and the',
      privacyLink: 'privacy policy',
      submit: 'Create account',
      submitting: 'Creating account…',
      haveAccount: 'Already have an account?',
      loginLink: 'Log in',
      errors: {
        firstNameRequired: 'Please enter your first name.',
        lastNameRequired: 'Please enter your last name.',
        phoneRequired: 'Please enter your phone number.',
        phoneInvalid: 'That phone number does not look right.',
        emailRequired: 'Please enter your e-mail address.',
        emailInvalid: 'That e-mail address does not look right.',
        passwordRequired: 'Please choose a password.',
        passwordShort: 'Your password must be at least 12 characters.',
        confirmMismatch: 'The passwords do not match.',
        termsRequired: 'You need to accept the terms to continue.',
        taken: 'An account with this e-mail address already exists.',
        takenLogin: 'Log in with this address instead',
        passwordWeak:
          'That password is too easy to guess. Please choose a less obvious one.',
        invalid: 'Please check the details you entered and try again.',
        offline: 'Signing up is not working right now. Please try again later.',
        tooMany: 'Too many attempts. Please try again in an hour.',
      },
      notImplemented:
        'Sign up is not connected yet: there is no server to create the account on.',
    },
    passwordReset: {
      requestTitle: 'Forgotten your password',
      requestSubtitle:
        'Enter your e-mail address. If it belongs to an account, we will send you a link to choose a new password.',
      email: 'E-mail address',
      requestSubmit: 'Send me a link',
      requestSubmitting: 'Sending…',
      // Conditional on purpose: the server does not say whether the address
      // exists, so this page must not promise that it does.
      sentBody:
        'If an account exists for that e-mail address, a link is on its way to it.',
      sentNote:
        'The link is valid for one hour. Please check your spam folder as well.',
      backToLogin: 'Back to log in',
      chooseTitle: 'Choose a new password',
      chooseSubtitle: 'Pick a new password for your account.',
      newPassword: 'New password',
      confirm: 'Confirm password',
      chooseSubmit: 'Save password',
      chooseSubmitting: 'Saving…',
      done: 'Your password has been changed. You can log in now.',
      deadTitle: 'This link no longer works',
      deadBody:
        'This link has expired or has already been used. Request a new one to continue.',
      requestAnother: 'Request a new link',
      errors: {
        emailRequired: 'Please enter your e-mail address.',
        emailInvalid: 'That e-mail address does not look right.',
        passwordRequired: 'Please choose a password.',
        passwordShort: 'Your password must be at least 12 characters.',
        passwordWeak:
          'That password is too easy to guess. Please choose a less obvious one.',
        confirmMismatch: 'The passwords do not match.',
        tooMany: 'Too many requests. Please try again in an hour.',
        offline: 'That is not working right now. Please try again later.',
      },
    },
    // Courier tracking: a webshop order on its way to our warehouse
    // (components/CourierTracking, backend/tracking/).
    courier: {
      openLink: "Follow at the courier",
      title: "Courier tracking",
      unknownCarrier: "Courier",
      lastLocation: "Last known location",
      expected: "Expected delivery",
      delivered: "Delivered on",
      lastUpdated: "Last updated",
      notKnown: "Not known yet",
      notYet: "Not yet",
      history: "Updates",
      noEventsYet: "No updates from the courier yet. They usually appear within a few hours of the shop sending your order.",
      manualOnly: "This courier is not followed automatically. Our team adds updates when we have them.",
      sourceCourier: "Courier",
      sourceUs: "Our team",
      stageIncoming: "On its way to our warehouse",
      stageOutgoing: "On its way to you",
      copy: "Copy",
      copied: "Copied",
      copyLabel: "Copy tracking number",
      testData: "Test data",
      testDataNote: "This is made-up test data, not real information from the courier.",
      carrierLabel: "Courier company",
      carrierPlaceholder: "Choose the courier",
      // The courier list's last choice (server code "other").
      otherCarrier: "Other courier",
      carrierHint: "Choose the courier to follow your parcel on its way to our warehouse.",
      problems: {
        delivery_failed: "The courier could not deliver this parcel to our warehouse. Check the courier's page or contact the shop.",
        delayed: "The courier reports a delay.",
        returned: "The courier is returning this parcel to the shop. Please contact the shop.",
        exception: "The courier reports a problem with this parcel.",
      },
      status: {
        order_registered: "Order registered",
        awaiting_arrival: "Awaiting package arrival",
        received_at_warehouse: "Received at our warehouse",
        processing_at_warehouse: "Processing at our warehouse",
        ready_for_shipment: "Ready for shipment",
        dispatched: "Dispatched",
        in_transit: "In transit",
        arrived_at_destination: "Arrived in destination country",
        customs: "Customs clearance",
        out_for_delivery: "Out for delivery",
        delivered: "Delivered to our warehouse",
        delivery_failed: "Delivery attempt failed",
        delayed: "Delayed",
        returned: "Returned to sender",
        exception: "Problem with delivery",
      },
    },
    // Pre-alerts: a parcel on its way to our warehouse (pages/PreAlert, Profile/PreAlerts.jsx).
    prealert: {
      newButton: "Pre-alert a package",
      listTitle: "On the way to our warehouse",
      loadFailed: "Your pre-alerts could not be loaded. Try again later.",
      empty: "No pre-alerts yet. Ordered something? Pre-alert it so we recognise it when it arrives.",
      dialogTitle: "Pre-alert",
      close: "Close",
      statusLabel: "Status",
      back: "Back",
      title: "Pre-alert a package",
      intro: "Tell us a parcel is on its way to our warehouse, so we know it is yours and can process it as fast as possible.",
      requiredNote: "Fields marked * are required.",
      read: {
        title: "Quicker: fill it in from a screenshot",
        text: "Upload a screenshot or PDF of the webshop's order confirmation or shipping e-mail. We fill in the form for you; you check it afterwards.",
        button: "Choose screenshot",
        reading: "Reading…",
        done: "Filled in from your screenshot. Check everything before you send.",
        nothing: "We could not find anything useful in this file. Please fill in the form yourself.",
        failed: "The file could not be read just now. Please fill in the form yourself.",
      },
      trackingNumber: "Tracking number",
      carrier: "Courier company",
      chooseCarrier: "Choose the courier",
      shop: "Store where you bought it",
      chooseShop: "Choose the store",
      otherShop: "Another store…",
      shopName: "Name of the store",
      description: "Package description",
      descriptionPlaceholder: "For example: 1 computer motherboard and 1 power supply",
      consignee: "Consignee (who receives it)",
      value: "Declared value",
      invoice: "Invoice",
      invoiceHint: "The shop's invoice or order confirmation: PDF, JPG, PNG or WebP, at most 10 MB each, up to {count} files. Optional, but it speeds up customs.",
      addFile: "Add a file",
      removeFile: "Remove",
      noInvoice: "No invoice added.",
      restrictedBefore: "I confirm that I have read the",
      restrictedLink: "list of items we cannot ship",
      restrictedAnd: "and the",
      termsLink: "terms and conditions",
      send: "Send pre-alert",
      sending: "Sending…",
      leave: "Cancel",
      savedTitle: "Pre-alert registered",
      savedText: "Thank you. Your pre-alert {reference} has been registered.",
      savedNext: "We will follow your parcel and let you know when it arrives at our warehouse. You can find it under My shipments.",
      toShipments: "Go to My shipments",
      another: "Pre-alert another package",
      inShipment: "In our shipment",
      cancel: "Cancel this pre-alert",
      cancelConfirm: "Cancel this pre-alert? We will no longer expect this parcel.",
      cancelled: "The pre-alert has been cancelled.",
      status: {
        submitted: "Pre-alert submitted",
        arrived: "Arrived at our warehouse",
        in_shipment: "Added to a shipment",
        cancelled: "Cancelled",
      },
      errors: {
        failed: "That did not work. Check your connection and try again.",
        trackingNumber: "Enter the tracking number.",
        carrier: "Choose the courier company.",
        shop: "Choose the store, or type its name.",
        description: "Describe what is in the package.",
        consignee: "Enter who receives the package.",
        restricted: "Confirm that you have read the list of items we cannot ship.",
        fileType: "{name}: only a PDF, JPG, PNG or WebP can be added.",
        fileSize: "{name} is larger than 10 MB.",
        fileCount: "At most {count} files.",
      },
    },
    tracking: {
      notRegistered: "We don't know this number yet. Did you get it from the shop or courier?",
      registerIt: "Register the package here and follow it all the way to our warehouse.",
      title: 'Track your shipment',
      // The whole order under the box on the profile page (TrackedOrder.jsx).
      details: {
        booked: "Booked on {date} · Booking {number}",
        loading: "Loading your shipment…",
        failed: "The full details could not be loaded. You can see them under My shipments.",
        ordersTitle: "Your orders in this shipment",
        courierOrder: "Order: {shop} – {description}",
        inShipment: "Part of our shipment {number}.",
        onwardTitle: "How your shipment reaches you",
      },
      subtitle: "Enter your tracking number, or the courier's number, to see everything about your order.",
      label: 'Tracking number',
      placeholder: "For example PLSM-1001 or 3SABC1234567",
      submit: 'Track shipment',
      searching: 'Searching…',
      hint: "Our tracking number is in your confirmation e-mail; the courier's number comes from the shop.",
      number: 'Tracking number',
      destination: 'Destination',
      shipped: 'Shipped on',
      delivered: 'Delivered on',
      expected: 'Estimated arrival',
      progress: 'Shipment progress',
      notKnown: 'Not known yet',
      privacyNote:
        'This shows the status and destination. You will find the full details of your shipment under My shipments.',
      locked: {
        title: 'Shipment sent',
        body: 'This shipment has already been sent and can no longer be changed. New purchases are sent as a separate shipment, with their own tracking number.',
        delivered: 'This shipment has been delivered and can no longer be changed.',
        cancelled: 'This shipment was cancelled and can no longer be changed.',
      },
      errors: {
        required: 'Please enter a tracking number.',
        notFound:
          'We could not find a shipment with that tracking number on your account. Please check it and try again.',
        tooMany: 'Too many searches. Please try again in an hour.',
        offline: 'Searching is not working right now. Please try again later.',
      },
    },
    booking: {
      // Normal or guided form, and the guided form's steps (pages/Booking/Booking.jsx).
      mode: {
        title: "How would you like to fill in the form?",
        normal: "Normal form",
        normalText: "Fill in all booking details on one page.",
        guided: "Guided form",
        guidedText: "Complete your booking one step at a time.",
      },
      steps: {
        label: "Booking steps",
        counter: "Step {step} of {total}: {name}",
        shipment: "Shipment",
        sender: "Sender",
        recipient: "Recipient",
        consignment: "Consignment",
        options: "Options",
        review: "Review",
      },
      guided: {
        continue: "Continue",
        back: "Back",
        edit: "Edit",
        yes: "Yes",
        no: "No",
        store: "Store",
        name: "Name",
        optionsTitle: "Additional options",
        reviewTitle: "Check your booking",
        reviewText: "Check everything below. Use Edit to change a section; nothing you filled in is lost.",
        recipientHint: "The person who receives the shipment on the island: their name, address and phone number for the delivery.",
      },
      title: 'Booking form',
      lead: 'Fill in the booking form here instead of on paper. We add the shipping number, volume and weight once your shipment reaches us.',
      nav: 'Booking',
      sections: {
        shipment: 'Shipment',
        sender: 'Sender',
        recipient: 'Recipient',
        consignment: 'The consignment',
        emigration: 'Emigration',
        insurance: 'Insurance and remarks',
        terms: 'Terms and signature',
      },
      freightLabel: 'Type of freight',
      freight: { sea: 'Sea freight', air: 'Air freight' },
      destinationLabel: 'Destination',
      destinationOther: 'Other',
      destinationOtherPlaceholder: 'Which destination?',
      firstName: 'First name',
      lastName: 'Last name',
      address: 'Address',
      postalCode: 'Postcode',
      city: 'Town',
      phone: 'Phone number',
      email: 'E-mail address',
      emailOptional: 'E-mail address (optional)',
      cribOptional: 'Crib number (optional)',
      quantity: 'Quantity',
      quantityHint:
        'Not sure yet how many parcels your order will arrive in? Leave this empty: we count the parcels once they reach us.',
      unit: 'Type',
      units: { boxes: 'Boxes', pallets: 'Pallets', colli: 'Colli' },
      contents: 'Contents',
      contentsAttached: 'I am sending the packing list separately',
      // "Uw bestellingen" on the booking form (src/pages/Booking/OrdersField.jsx).
      orders: {
        title: 'Your orders',
        hint: 'For each store, choose where you ordered, then add each product: what it is and its link. A screenshot of your order helps us recognise everything quickly.',
        store: 'Store {number}',
        shop: 'Store',
        choose: 'Choose a store…',
        other: 'Another store',
        otherName: 'Name of the store',
        description: 'What did you order?',
        descriptionPlaceholder: 'For example: laptop and mouse',
        screenshot: 'Screenshot of your order (optional)',
        addScreenshot: 'Add a screenshot',
        screenshotFor: 'Screenshot for store {number}',
        removeScreenshot: 'Remove {name}',
        removeStore: 'Remove',
        add: 'Add another store',
        product: 'Product {number}',
        removeProduct: 'Remove',
        removeProductNamed: 'Remove product {number}',
        addProduct: 'Add another product',
        url: 'Product link (optional)',
        urlPlaceholder: 'Paste the direct link to your product here.',
        productScreenshot: 'Screenshot of this product (optional)',
        productScreenshotFor: 'Screenshot for product {product} of store {number}',
        wrongType: '{name} cannot be added: only PNG, JPG, WebP or PDF.',
        tooBig: '{name} is larger than 10 MB.',
        refused: 'A store or screenshot could not be processed. Check your orders and try again.',
        errors: {
          shop: 'Choose a store.',
          shopName: 'Fill in the name of the store.',
          description: 'Fill in what you ordered.',
          url: 'Paste the full link, starting with https://',
        },
      },
      value: 'Value',
      valueHint:
        'Customs uses this figure to calculate import duty. Please give the real value.',
      packingLabel: 'Packing',
      packing: { sender: 'By me', company: 'By Pay Less Shop More' },
      paymentLabel: 'Payment',
      payment: { bank: 'Bank', cash: 'Cash' },
      vehicleLabel: 'If a vehicle',
      vehicle: {
        na: 'Not applicable',
        combustion: 'Petrol/diesel',
        electric: 'Electric/hybrid',
      },
      emigration: 'This shipment is part of an emigration',
      id_present: 'ID present',
      deregistered: 'Deregistered',
      deregistration_present: 'Proof of deregistration present',
      insured: 'I would like to insure this shipment',
      insuranceInfo: {
        button: 'How does the insurance work?',
        text: 'The premium is 1.5% of the value of the goods + shipping costs, with a minimum premium of €95.00. The excess is 1% of the insured value, with a minimum excess of €250.00 and a maximum excess of €750.00.',
      },
      insuredValue: 'Insured value',
      notes: 'Remarks',
      termsClause: {
        important: 'IMPORTANT!',
        agreeBefore: 'The sender agrees to the',
        termsLink: 'terms and conditions',
        liability:
          '{company} is not responsible for the contents and value of the packages and cannot be held liable for them in any way. The declared value will be used by customs to calculate import duties. You are responsible for this value yourself, and if customs does not agree with the declared value, they will revise it. Transporting prohibited items is a criminal offence.',
        insurance:
          'The sender agrees that the goods are not insured unless separate insurance is taken out for a fee. Glass and pressed-wood items are always excluded.',
      },
      agree: 'I agree to the terms and conditions above.',
      signature: 'Signature',
      signatureHint:
        'Type your full name. Together with the box above, this stands as your signature.',
      submit: 'Send booking',
      sending: 'Sending…',
      officeNote:
        'We fill in the shipping number, volume, weight and packing check once your shipment reaches us.',
      done: {
        title: 'We have your booking',
        body: 'We will be in touch as soon as the shipment has been booked in.',
        reference: 'Your reference:',
        home: 'Back to the homepage',
        seeBookings: 'See my bookings',
        signInTip: 'Tip: next time, log in first. Then you will find your booking in your account, under "My bookings".',
      },
      errors: {
        required: 'This field is required.',
        email: 'That e-mail address does not look right.',
        phone: 'That phone number does not look right.',
        quantity: 'Please enter a quantity of at least 1, or leave it empty.',
        value: 'Please enter the value of the shipment.',
        contents: 'Describe the contents, or tick that the packing list follows separately.',
        insuredValue: 'Please enter the value to insure.',
        signature: 'Type your full name to sign.',
        terms: 'You need to accept the terms to continue.',
        invalid: 'Please check the details you entered.',
        tooMany: 'Too many requests sent. Please try again in an hour.',
        offline: 'Sending is not working right now. Please try again later.',
      },
    },
    loading: {
      message: 'Loading…',
      slow: 'This is taking longer than usual. Your connection may be slow.',
      failedTitle: 'No connection',
      failedBody:
        'We could not load the data. Check your internet connection and try again.',
      retry: 'Try again',
      retrying: 'Trying again…',
    },
    profile: {
      title: 'My account',
      subtitle: 'Manage your details, address and preferences.',
      demoNotice:
        'Note: this screen shows example data. No server is connected yet, so changes are not saved.',
      memberSince: 'Customer since',
      goToWarehouse: 'Go to the warehouse',
      // "What to do next" banner for customers (pages/Profile/NextSteps.jsx).
      nextSteps: {
        title: 'What is the next step?',
        intro: 'This is how you ship your parcels with us, in three steps:',
        bookButton: 'Make a booking',
        steps: {
          order: { title: 'Order from a webshop', text: 'Use our warehouse address as both billing and delivery address.', link: 'See the address' },
          book: { title: 'Make a booking', text: 'Fill in the booking form, so we know what is coming for you and where it has to go.' },
          follow: { title: 'Follow your shipment', text: 'As soon as your parcels arrive, you will see them under My shipments.', link: 'Go to my shipments' },
        },
      },
      // A warehouse worker signed in with a password opening the warehouse.
      unlock: {
        title: 'Go to the warehouse',
        intro: 'Enter your e-mail address and your PIN to open the warehouse.',
        email: 'E-mail address',
        pin: 'PIN',
        submit: 'Open the warehouse',
        opening: 'Opening…',
        cancel: 'Cancel',
        noPinHelp:
          'You have no PIN yet. Ask an admin for a sign-in code, enter it below, and choose your PIN.',
        lockedHelp:
          'Your PIN is locked after too many wrong tries. Ask an admin for a sign-in code, enter it below, and choose a new PIN.',
        setup: {
          code: 'Sign-in code from the admin',
          pin: 'New PIN',
          repeat: 'Repeat the PIN',
          hint: 'Four digits. Not 1234, 0000 or anything like it.',
          submit: 'Save PIN and open the warehouse',
          errors: {
            code: 'The sign-in code is exactly four digits.',
            mismatch: 'The two PINs are not the same.',
            codeFailed: 'That sign-in code does not work. Check it, or ask an admin for a new one.',
          },
        },
        errors: {
          email: 'Please enter your e-mail address.',
          pin: 'A PIN is exactly four digits.',
          failed: 'That e-mail address or PIN is not right.',
          tooMany: 'Too many attempts. Wait a moment and try again.',
          offline: 'The warehouse cannot be opened right now. Please try again later.',
        },
      },
      // The profile's "Two-factor sign-in" card (pages/Profile/TwoFactorCard.jsx).
      twoFactor: {
        preparingAdmin: "Two-factor sign-in is switched off on the site. Set it up on your own account here first; then you can switch it on on the Security page.",
        preparedAdmin: "Your account is ready. You can now switch two-factor sign-in on on the Security page.",
        intro: 'After your password, the site asks for a code from an app on your phone (e.g. Google or Microsoft Authenticator), so nobody gets in with your password alone.',
        on: 'On',
        off: 'Off',
        required: 'required for your account',
        codesLeft: '{count} recovery codes left',
        turnOn: 'Turn on',
        newCodes: 'New recovery codes',
        turnOff: 'Turn off',
        password: 'Your password',
        code: 'Code from your app',
        turnOffConfirm: 'Turn two-factor off',
        newCodesConfirm: 'Make new codes',
        cancel: 'Cancel',
        freshCodes: 'Your new recovery codes. The old ones no longer work. Keep these safe; they are shown only once.',
        savedThem: 'I have saved them',
        turnedOff: 'Two-factor sign-in is off. Your other devices have been signed out.',
        wrongCode: 'That code is not right. Try the newest code from your app.',
        wrongPassword: 'That password is not right.',
        locked: 'Too many wrong codes. Wait 15 minutes and try again.',
        failed: 'That is not working right now. Please try again later.',
      },
      // "Your shipping address" (pages/Profile/WarehouseAddressCard.jsx).
      warehouseAddress: {
        title: "Your shipping address in the Netherlands",
        intro: "Ordering from a webshop (bol.com, Amazon, Coolblue, IKEA …)? Have your order sent to our warehouse. We receive the parcel and ship it on to you.",
        reminderTitle: "Important:",
        reminder: "use this address as the delivery address for every order. Fill it in exactly as shown below. If a parcel arrives with a different address or name, we cannot tell that it is yours.",
        firstName: "First name",
        lastName: "Last name",
        street: "Street and number",
        postcode: "Postcode",
        city: "City",
        country: "Country",
        firstNameFallback: "Your first name",
        lastNameFallback: "Your last name",
        nameHint: "Fill it in exactly like this: your own first name under \"first name\" and \"Pay less Shop More\" under \"last name\". Your first name is how we recognise your parcel at the warehouse.",
        copy: "Copy",
        copyAll: "Copy the whole address",
        copiedAll: "Address copied!",
        copied: "Copied.",
        copyFailed: "Copying did not work. Select the text and copy it yourself.",
        afterTitle: "After ordering",
        after1: "Keep the webshop's order confirmation.",
        after2: "Pre-alert the parcel, with the track-and-trace and the courier company.",
        after2Link: "Pre-alert a parcel",
        after3: "We follow your parcel until it reaches our warehouse and let you know as soon as it is in.",
      },
      sections: {
        details: 'Personal details',
        warehouseAddress: "Your shipping address",
        address: 'Delivery address',
        tracking: 'Track & Trace',
        shipments: 'My shipments',
        bookings: 'My bookings',
        invoices: 'My invoices',
        password: 'Change password',
        twoFactor: 'Two-factor sign-in',
        notifications: 'Notifications',
        danger: 'Delete account',
      },
      fields: {
        name: 'Full name',
        firstName: 'First name',
        lastName: 'Last name',
        email: 'E-mail address',
        phone: 'Phone number',
        street: 'Street and number',
        postalCode: 'Postal code',
        city: 'City',
        country: 'Country or island',
        currentPassword: 'Current password',
        newPassword: 'New password',
        confirmPassword: 'Confirm new password',
      },
      // "Mijn boekingen" (src/pages/Profile/MyBookings.jsx). The field
      // labels in its pop-up come from booking.* above.
      bookings: {
        handling: 'Handling costs',
        products: { link: 'Product link', copy: 'Copy link', copied: 'Copied', price: 'Price', quantity: 'Qty', subtotal: 'Subtotal', total: 'Store subtotal', noLink: 'No link given' },
        intro: 'The bookings you sent while logged in, newest first. Click a booking to see everything you filled in. Once we confirm a booking, you will find it under My shipments.',
        loading: 'Loading your bookings…',
        failed: 'Your bookings could not be loaded.',
        empty: 'You have no bookings yet. A booking you send while logged in will appear here.',
        new: 'New booking',
        title: 'Booking',
        reference: 'Reference',
        placedOn: 'Sent on',
        close: 'Close',
        officeHeading: 'Filled in by us',
        shippingNumber: 'Shipping number',
        noNumber: 'No shipping number yet',
        notMeasured: 'We fill in the volume and weight once your shipment is with us.',
        // Once the office works on a booking it becomes a shipment, followed under "My shipments".
        inShipments: 'Follow it under My shipments:',
        name: 'Name',
        crib: 'Crib number',
        listAttached: 'Packing list sent separately',
        notInsured: 'Not insured',
        yes: 'Yes',
        no: 'No',
        orders: 'Your orders',
        openFile: 'Open:',
        documents: {
          intro: 'You can add documents such as the order confirmation, invoice or track-and-trace per store at any time.',
          closed: 'This booking has been shipped or cancelled: documents can no longer be changed.',
          add: 'Add document',
          kind: 'Type of document',
          chooseKind: 'Choose a type',
          kinds: {
            order_confirmation: 'Order confirmation',
            invoice: 'Invoice',
            order_number: 'Order number (from the shop)',
            tracking: 'Track-and-trace',
            other: 'Other',
            screenshot: 'Screenshot',
          },
          file: 'File',
          hint: 'PDF, JPG, PNG or WebP, up to 10 MB.',
          upload: 'Upload',
          trackingLabel: 'Track-and-trace code or link',
          trackingPlaceholder: 'E.g. 3SABC1234567 or https://…',
          trackingHint: "Copy the code or link from the webshop's shipping e-mail.",
          orderNumberLabel: "The shop's order number (optional)",
          orderNumberPlaceholder: 'E.g. 1234567890',
          orderNumberHint: "The order number from the shop's confirmation e-mail. You may leave this empty.",
          addFile: 'Add file',
          replaceFile: 'Replace file',
          rowAdded: 'Added',
          rowMissing: 'Not added yet',
          moreOptions: 'Track & trace, order number or other file',
          done: 'Done',
          save: 'Save',
          saving: 'Saving…',
          confirmRemoveTracking: 'Remove the track-and-trace?',
          uploading: 'Uploading…',
          cancel: 'Cancel',
          remove: 'Remove',
          confirmRemove: 'Remove this document?',
          errors: {
            kind: 'Choose what kind of document this is.',
            file: 'Choose a file.',
            tracking: 'Enter the track-and-trace code or link.',
            orderNumber: 'Enter the order number.',
            failed: 'The document could not be added. Please try again.',
            removeFailed: 'The document could not be removed. Please try again.',
          },
        },
        valuePending: 'Not filled in yet: we fill in the value from your screenshots.',
        signedBy: 'Signed by',
        changeNote: 'Something not right, or want to change something? Contact us:',
        status: {
          new: 'Received',
          confirmed: 'Confirmed',
          booked_in: 'Booked in',
          shipped: 'Shipped',
          cancelled: 'Cancelled',
        },
      },
      shipments: {
        intro:
          'Every shipment is listed on its own, with its own tracking number, so you can see which things belong to which shipment. Buy something after a shipment has been sent and it goes on a new shipment of its own.',
        loading: 'Loading your shipments…',
        failed: 'Your shipments could not be loaded.',
        empty: 'You have no shipments yet.',
        shipped: 'Shipped',
        delivered: 'Delivered',
        registered: 'Registered on',
        notShippedYet: 'Not shipped yet',
        // The one date on a closed shipment bar ("Expected 15 Oct").
        // Month headings in a group; {month} is e.g. "October 2026".
        orderedIn: 'Ordered in {month}',
        // The "comes first" block at the top, and the badge on its bar.
        next: {
          label: 'Arriving first',
          // Under the title; {date} is e.g. "8 October".
          expected: 'Expected {date}',
          // The countdown: "in" / 3 / "days", or one word.
          before: 'in',
          unit: 'days',
          today: 'Today',
          tomorrow: 'Tomorrow',
          badge: 'Next',
        },
        bar: {
          expected: 'Expected',
          delivered: 'Delivered',
          shipped: 'Shipped',
          registered: 'Registered',
        },
        // What opens under a shipment (ShipmentDetails.jsx). {date}, {days}
        // and {island} are filled in by the page.
        // Delivery or pickup, in a shipment's pop-up (ShipmentDetails.jsx).
        handover: {
          title: 'How would you like to receive it?',
          delivery: 'Delivery',
          pickup: 'Pick it up myself',
          deliveryNote: 'Our agent will contact you to deliver it.',
          pickupNote: "You'll collect it yourself. We'll let you know when it's ready.",
          finished: 'This shipment is complete.',
          failed: 'Your choice could not be saved. Please try again.',
          chooseOnce: 'You can only choose once. After that it can only be changed by e-mail.',
          confirm: 'Are you sure? You are choosing "{choice}". After this you can only change it by e-mail.',
          changeByMail: 'Want to change this? Send an e-mail to',
          mailSubject: 'Change how I receive shipment',
        },
        details: {
          order: 'Shipment',
          photos: 'Photos of your package',
          photo: 'Photo {number}',
          openPhoto: 'Open:',
          // The photo viewer (components/PhotoGallery).
          gallery: {
            label: 'Viewing {name}',
            close: 'Close',
            download: 'Download',
            previous: 'Previous photo',
            next: 'Next photo',
            takenOn: 'taken on {date}',
          },
          measured: 'Measured at the warehouse',
          close: 'Close',
          howLong: 'How long will it take?',
          howLongWas: 'How long did it take?',
          arrivalOn: 'Expected arrival: {date}',
          daysLeft: 'About {days} days to go.',
          tomorrow: 'Expected tomorrow.',
          today: 'Expected today.',
          late: 'It is taking a little longer than expected. We will let you know as soon as your shipment has arrived.',
          deliveredOn: 'Delivered on {date}',
          took: 'The journey took {days} days.',
          notShipped: 'Not shipped yet',
          arrived: 'Arrived on the island',
          arrivedNext: 'Our agent will contact you to arrange delivery.',
          typical: 'As a guide: by sea freight a shipment to {island} sails for about {days} days; customs clearance then takes about a week and a half.',
          journey: 'Where is your shipment?',
          progress: 'Shipment progress',
          destination: 'Destination',
          registered: 'Registered',
          shipped: 'Shipped',
          delivered: 'Delivered',
          weight: 'Weight',
          value: 'Value',
          unknown: 'Not known yet',
          notYet: 'Not yet',
          invoice: 'Invoice',
          noInvoice: 'There is no invoice for this shipment yet.',
        },
        // The steps of the journey timeline, by the server's stage code.
        stages: {
          received: 'Received at our warehouse',
          ready_for_shipping: 'Ready for shipping',
          in_transit: 'In transit',
          arrived: 'Arrived at destination',
          delivered: 'Delivered',
          // The last step when the customer collects it (handover: pickup).
          picked_up: 'Picked up',
        },
        // The three headings the list is split under (Shipments.jsx).
        groups: {
          toSend: 'Still to be sent',
          onTheWay: 'On the way',
          received: 'Received',
          cancelled: 'Cancelled',
        },
        // The status label on each shipment, by the server's status code.
        status: {
          quoted: 'Quote sent',
          paid: 'Paid',
          purchased: 'Products purchased',
          ready_for_shipping: 'Ready for shipping',
          in_transit: 'In transit',
          arrived: 'Arrived at destination',
          delivered: 'Delivered',
          // A delivered shipment the customer collected themselves.
          picked_up: 'Picked up',
          cancelled: 'Cancelled',
        },
        locked: {
          title: 'Shipment sent',
          titleDelivered: 'Shipment delivered',
          titleCancelled: 'Shipment cancelled',
          body: 'This shipment has already been sent and can no longer be changed. New purchases are sent as a separate shipment, with their own tracking number.',
          delivered: 'This shipment has been delivered and can no longer be changed.',
          cancelled: 'This shipment was cancelled and can no longer be changed.',
        },
      },
      invoices: {
        intro:
          'We raise an invoice for every paid shipment. Once it has been sent, it is here as a PDF.',
        loading: 'Loading your invoices…',
        empty: 'You have no invoices yet. They appear here once a shipment has been paid for and processed.',
        failed: 'Your invoices could not be loaded.',
        retry: 'Try again',
        tracking: 'Shipment',
        download: 'Download PDF',
      },
      notifications: {
        shipping: 'Updates about my shipments',
      },
      dangerText:
        'Deleting your account is permanent. All your details and shipment history will be lost.',
      deleteAccount: 'Delete account',
      deleteConfirm: 'Are you sure? This cannot be undone.',
      deletePasswordLabel: 'Confirm with your password',
      deleteAnonymised:
        'Your personal details have been erased. Your shipment records are kept because we are legally required to retain them.',
      deleteDone: 'Your account has been deleted.',
      deleteCancel: 'Cancel',
      deleteYes: 'Yes, delete my account',
      save: 'Save',
      saving: 'Saving…',
      saved: 'Your changes have been saved.',
      errors: {
        nameRequired: 'Please enter your name.',
        firstNameRequired: 'Please enter your first name.',
        lastNameRequired: 'Please enter your last name.',
        emailRequired: 'Please enter your e-mail address.',
        emailInvalid: 'That e-mail address does not look right.',
        currentRequired: 'Please enter your current password.',
        passwordShort: 'Your new password must be at least 12 characters.',
        confirmMismatch: 'The passwords do not match.',
        offline: 'Saving is not working right now. Please try again later.',
      },
      notImplemented:
        'Saving is not connected yet: there is no server to send the changes to.',
    },
    destination: {
      // The "Other destinations" page: everywhere we ship that has no page
      // of its own. See pages/Destinations/OtherDestinations.jsx.
      otherTitle: 'Other destinations',
      otherLead:
        'We ship to the countries below as well. These destinations have no page of their own, but we arrange your shipment there just the same — ask us about the options and the cost.',
      otherCta: 'Ask about this destination',
      eyebrow: 'From order to front door',
      step: 'Step',
      howTitle: 'How your order reaches {island}',
      howSubtitle:
        'You do the buying, we take care of the shipping. Two steps are yours, two are ours.',
      indexTitle: 'Our destinations',
      indexSubtitle:
        'We sail to five destinations. Pick one to see how long the crossing takes and what to expect.',
      indexTransit: 'Crossing',
      indexArrives: 'Arrives in',
      indexDays: '{days} days',
      indexMore: 'See this destination',
      who: {
        you: 'You do this',
        us: 'We do this',
      },
      facts: {
        transit: 'Crossing',
        transitValue: 'about {days} days',
        arrives: 'Arrives in',
        vat: 'Prices',
        vatValue: 'Without Dutch VAT',
        handover: 'Delivery',
        handoverValue: 'Our agent gets in touch',
      },
      stages: {
        quote: {
          title: 'Request a quote',
          body: 'Tell us what you would like to ship. We send you an indicative quote for shipping it to {island}.',
        },
        purchase: {
          title: 'You do the buying',
          body: 'You order and pay for your purchases yourself and have them delivered to our warehouse address in the Netherlands. Then register the shipment with us using the booking form.',
        },
        ship: {
          title: 'We ship',
          body: 'We receive your parcels, measure and weigh them, and send them to {island} by sea freight or air freight.',
        },
        deliver: {
          title: 'We clear customs and deliver',
          body: 'We take care of customs clearance on {island}. As soon as your shipment is ready, our agent gets in touch with you to arrange delivery.',
        },
      },
      faq: {
        title: 'Questions about shipping to {island}',
        more: 'Not the question you had?',
        contact: 'Ask us',
        what: {
          q: 'What can I have shipped?',
          a: 'Almost anything: clothing, electronics, appliances, tools and furniture. Hazardous goods, fresh food and loose batteries are the exceptions.',
        },
        cost: {
          q: 'What does the price depend on?',
          a: 'The weight and the volume of your shipment, and how it travels: sea freight or air freight. Our quotes are always indicative; the final figure depends on what we measure and weigh when it reaches our warehouse.',
        },
        time: {
          q: 'How long does it take?',
          a: 'By sea freight the crossing to {port} takes about {days} days, and customs clearance then takes about a week and a half. Air freight is quicker: hand it in by Thursday 12:00, it flies at the weekend, and clearance takes about 3–4 days.',
        },
        customs: {
          q: 'Do I have to deal with customs myself?',
          a: 'No. We prepare the paperwork and handle the customs side. Import duties at the destination are separate; your quote gives an indication of them.',
        },
        oversize: {
          q: 'What about large items?',
          a: 'They can travel. We look case by case at the best way to ship them. Include the dimensions in your request.',
        },
      },
      quote: {
        title: 'Request a quote',
        intro:
          'Tell us what you would like to ship and we will work out what it costs to get it to you. Our quotes are always indicative.',
        forIsland: 'Quote for',
        optional: '(optional)',
        orDrop: 'or drop it here',
        filesNote:
          'One file per request. Have more than one, or none at all? Describe it in the message box below, or e-mail the rest to',
        requiredNote: 'Fields marked * are required.',
        firstName: 'First name',
        lastName: 'Last name',
        email: 'Email address',
        // The upload is meant for the webshop invoice of what is being sent.
        upload: 'Your invoice',
        // The "How does this work?" pop-up above the form (HelpDialog). Each
        // line of `steps` becomes one numbered step in the pop-up.
        help: {
          open: 'How does this form work?',
          title: 'How to request a quote',
          steps: [
            'Fill in your first name, last name and email address. We send the quote to that email address.',
            'Upload the invoice for your order under "Your invoice": click "Choose a file" or drag the file into the box. A PDF, photo or screenshot (JPG or PNG) of up to 10 MB is fine.',
            'No invoice yet, or more than one? Describe what you want to send in the message box, or email the other invoices to info@paylesshopmore.com.',
            'Click "Send request". You will receive an indicative quote by email as soon as possible.',
          ],
          done: 'Got it',
          close: 'Close',
        },
        uploadHint: 'PDF, JPG or PNG, up to 10 MB.',
        chooseFile: 'Choose a file',
        noFile: 'No file selected',
        removeFile: 'Remove file',
        message: 'Your message',
        messagePlaceholder:
          'Describe what you would like to ship, or tell us anything we should know.',
        send: 'Send request',
        sending: 'Sending…',
        errors: {
          firstNameRequired: 'Please enter your first name.',
          lastNameRequired: 'Please enter your last name.',
          emailRequired: 'Please enter your email address.',
          emailInvalid: 'That email address does not look right.',
          fileTooLarge: 'That file is larger than 10 MB.',
          fileType: 'Please choose a PDF, JPG or PNG file.',
          invalid: 'Please check the details you entered.',
          tooMany: 'Too many requests sent. Please try again in an hour.',
        },
        sent: 'Thank you! Your request has been sent — you will receive an indicative quote as soon as possible.',
        notImplemented:
          'The quote form is not connected yet: there is no server to send the request to.',
      },
    },
    home: {
      hero: {
        eyebrow: 'VAT-free from the Netherlands to Aruba, Bonaire and Curaçao',
        title: 'Shop in the Netherlands. We deliver it VAT-free to the island.',
        lead: 'Buy from any Dutch webshop and have it sent to our warehouse in the Netherlands. Your orders, simply taken care of. We combine and ship them free of Dutch VAT by boat or plane, and then deliver them to your door in Aruba, Bonaire or Curaçao.',
        trackCta: 'Track a shipment',
        startCta: 'Get started',
        howCta: 'How it works',
        myShipments: 'My shipments',
        points: {
          shop: {
            title: 'You shop',
            body: 'At any Dutch webshop, with our address as the delivery address.',
          },
          ship: {
            title: 'We ship',
            body: 'We combine your parcels and send them VAT-free by sea freight or air freight.',
          },
          deliver: {
            title: 'You receive',
            body: 'Our agent on the island makes sure your order is delivered easily to your home or your workplace.',
          },
        },
      },
      shops: {
        title: 'ORDER FROM YOUR FAVOURITE SHOPS',
        visit: 'Visit shop',
        cta: 'See all shops',
      },
      stats: {
        title: 'Our numbers',
        loading: 'Loading figures…',
        delivered: 'Packages delivered',
        destinations: 'Destinations served',
        customers: 'Customers',
        tracking: 'Shipment tracking',
      },
      map: {
        eyebrow: 'Our routes',
        title: 'From the Netherlands to the islands',
        lead: 'Hover over a destination to see the route and how long it takes.',
        origin: 'Netherlands',
        hint: 'Choose a destination on the map to see the route.',
        sea: 'Sea freight',
        seaDays: '{days} days at sea',
        seaClearance: 'Customs clearance about a week and a half',
        air: 'Air freight',
        flights: {
          thursdayWeekend: 'Hand in by Thursday 12:00 — flies at the weekend',
          mondayThursday: 'Hand in on Monday or Thursday before 12:00',
        },
        airClearance: 'Transit and customs clearance about 3–4 days',
        more: 'See this destination',
      },
      services: {
        eyebrow: 'What we do',
        title: 'Everything your shipment needs',
        lead: 'From ordering at a webshop to delivery on the island.',
        learnMore: 'Learn more',
        shopAndShip: {
          title: 'Shop & ship',
          body: 'Order from Dutch webshops and have it delivered to our address. We handle the rest.',
        },
        consolidation: {
          title: 'Consolidation',
          body: 'We combine several orders into one shipment, so you pay shipping once instead of many times.',
        },
        doorToDoor: {
          title: 'Door to door',
          body: 'Our agent at the destination gets in touch and arranges delivery to your home.',
        },
        customs: {
          title: 'Customs and paperwork',
          body: 'We prepare the documents and handle customs, so your shipment does not sit waiting.',
        },
        tracking: {
          title: 'Track and trace',
          body: 'Follow your shipments in your account, from departure to delivery.',
        },
        business: {
          title: 'Business shipping',
          body: 'Shipping to the islands regularly? Get in touch for arrangements that suit you.',
        },
      },
      journey: {
        eyebrow: 'From order to door',
        title: 'What happens to your shipment',
        lead: 'Every shipment goes through the same stages, and your account always shows which one it is at.',
        stages: {
          ordered: 'Ordered',
          collected: 'Delivered/Collecting',
          inTransit: 'In transit',
          arrived: 'Arrived at destination',
          ready: 'Ready',
        },
      },
      cta2: {
        title: 'Ready to move your next shipment?',
        lead: 'Manage your logistics and track your shipments from one place.',
        start: 'Start shipping',
        track: 'Track shipment',
      },
      cta: {
        titleAccent: 'ORDER DIRECTLY',
        title: 'AND SAFELY',
        body: 'We ship your favourite products and goods from Dutch companies VAT-free to Curaçao or Bonaire. No more having to trouble friends and family. Get in touch with us for more information about our services, or with any questions.',
        button: 'CONTACT US',
        videoLabel: 'Play video',
        videoSlot: 'Video — add the poster and the embed',
      },
      steps: {
        title: 'How to order',
        account: 'Create an account',
        shop: 'Shop and Pay Less',
        payment: 'Fill in the correct payment details',
        documents: 'Upload your documents',
        pickup: 'Pick up your orders',
      },
      shopAndShip: {
        title: 'Shop and ship to Aruba, Bonaire and Curaçao',
        readMore: 'Read more',
        readMoreAbout: 'about',
        particulier: {
          title: 'Private customers',
          body: 'We are here for you when you are moving abroad. An international move takes a great deal of time and energy. We have long experience with it and will help you leave well prepared. We can transport your belongings door to door.',
        },
        zakelijk: {
          title: 'Business',
          body: 'We are glad to serve businesses of every size with all kinds of transport. Whether it is a pallet load, a single parcel, larger equipment, containers or bulk cargo, you have come to the right place. We aim to map out your requirements as precisely as possible so that we can carry them out with the greatest care.',
        },
        payless: {
          title: 'Pay Less Shop More',
          body: 'Would you like to receive Dutch products without having to involve your friends and family in the Netherlands? We ship and forward all products VAT-free to your home or business in Bonaire or Curaçao.',
        },
      },
    },
    services: {
      hero: {
        title: 'Our services',
        lead: 'Discover our services for Aruba, Bonaire and Curaçao.',
      },
      islandsLabel: 'Our islands',
      companies: {
        title: 'Shops',
        lead: 'The shops our customers order from most.',
        placeholder: 'Name',
        cta: 'View shop',
      },
      offer: {
        title: 'What we do for you',
        lead: 'From our warehouse in the Netherlands to delivery on the island.',
        sea: {
          title: 'Sea freight',
          body: 'For large, heavy or bulky shipments. The crossing takes {min} to {max} days, depending on the island.',
        },
        air: {
          title: 'Air freight',
          body: 'In a hurry? By air your shipment reaches the island sooner: hand it in by Thursday 12:00 and it flies at the weekend.',
        },
        warehouse: {
          title: 'Receiving and consolidation',
          body: 'We receive your parcels at our warehouse in the Netherlands, measure and weigh them, and combine them into one shipment.',
        },
        customs: {
          title: 'Customs and clearance',
          body: 'We take care of the paperwork and the customs clearance on the island: about a week and a half for sea freight, about 3–4 days for air freight.',
        },
        delivery: {
          title: 'Delivery on the island',
          body: 'As soon as your shipment is ready, our agent gets in touch with you to arrange delivery.',
        },
        moving: {
          title: 'Moving and business',
          body: 'Emigrating, or shipping for your business? We also ship household goods, pallets and larger consignments. Just ask about the options.',
        },
      },
      contactCta: {
        title: 'Wondering what we can do for you?',
        button: 'Get in touch with us',
      },
      eyebrow: 'OUR',
      title: 'SERVICES',
      breadcrumb: 'Services',
      sectionTitle: 'Our services',
      forIsland: 'Our services for',
      lead: 'From your order at a Dutch webshop to delivery at your door on the island.',
      islandsTitle: 'Where we ship',
      islandsLead: 'Choose your destination to see how it works and request a quote.',
      viewDestination: 'View destination',
      shopsTitle: 'Shops our customers order from',
      shopsLead: 'You can order from almost any Dutch webshop. These are the ones we see most often.',
      ctaTitle: 'Questions about our services?',
      ctaBody: 'Tell us what you would like shipped and we will send you a quote.',
      ctaPrimary: 'Get in touch',
      ctaSecondary: 'See destinations',
      highlights: {
        vat: 'VAT exemption',
        products: 'Unique products',
        transport: 'Transport taken care of',
      },
      actions: {
        book: 'Register a shipment',
        destinations: 'See destinations',
        faq: 'Read the common questions',
        track: 'Track your shipment',
        contact: 'Get in touch',
      },
      shopsFooter:
        'Do not see your shop? That is fine — you can order from almost any Dutch webshop and have the parcel sent to our warehouse.',
      shops: {
        general: {
          title: 'General range',
          note: 'Large department stores where you can find almost anything in a single order.',
        },
        electronics: {
          title: 'Electronics',
          note: 'Mind the voltage and the plug: the islands do not always match the Dutch standard.',
        },
        fashion: {
          title: 'Fashion and home',
          note: 'Clothing and furniture. Large furniture is priced on volume, so ask for a quote first.',
        },
        beauty: {
          title: 'Beauty and drugstore',
          note: 'Liquids and aerosols are restricted on air freight; sea freight allows a good deal more.',
        },
        kids: {
          title: 'Kids and toys',
          note: 'Toys and baby goods. Battery-powered toys are declared separately.',
        },
        specialist: {
          title: 'Specialist',
          note: 'Car parts, books and office supplies. Parts holding oil or a battery need extra paperwork.',
        },
      },
      rates: {
        title: 'What does it cost?',
        lead: 'Our rates start at the amounts below. What you pay in the end depends on the volume, the weight and the destination of your shipment.',
        from: 'from',
        popular: 'Most chosen',
        factorsTitle: 'What decides the price?',
        note: 'The amounts above are indicative and meant as a starting point. We measure and weigh your shipment at the warehouse; the quote you receive afterwards is the figure that applies.',
        cta: 'Request a quote',
        tiers: {
          parcel: {
            name: 'Parcel',
            size: 'Up to roughly 30 × 30 × 30 cm',
            body: 'A single webshop order: clothing, books, small electronics or parts.',
          },
          box: {
            name: 'Box',
            size: 'Up to roughly 60 × 40 × 40 cm',
            body: 'Several orders that we combine into one shipment for you.',
          },
          pallet: {
            name: 'Pallet',
            size: 'From roughly 120 × 80 cm',
            body: 'Household removals, furniture or business stock.',
          },
        },
        factors: {
          volume: 'Volume and weight — we charge on whichever of the two is higher.',
          destination: 'The destination and the sailing time to that port.',
          insurance: 'Whether you want the shipment insured for its value.',
        },
      },
      faq: {
        title: 'Common questions',
        more: 'Question not answered here?',
        contact: 'Get in touch with us',
        transit: {
          q: 'How long does a shipment take?',
          a: 'Allow 18 to 28 days from the moment your parcel reaches our warehouse. Sint Maarten takes about 18 days, Aruba and Curaçao 21, Bonaire 24 and Suriname 28 days.',
        },
        customs: {
          q: 'Do I have to handle customs myself?',
          a: 'No. We prepare and file the customs paperwork for you. Import duties and local taxes at the destination remain payable by you; we tell you in advance what to expect.',
        },
        vat: {
          q: 'Do I get the VAT back?',
          a: 'Because your order leaves the Netherlands, you can often claim a VAT exemption. That saves up to 21% on the purchase price. We tell you per webshop whether this is possible and what details are needed.',
        },
        prohibited: {
          q: 'What can I not send?',
          a: 'We cannot carry hazardous goods, flammable liquids, loose lithium batteries, weapons, perishables, cash or live animals. If you are unsure about an item, ask us before you order.',
        },
        insurance: {
          q: 'Is my shipment insured?',
          a: 'The carrier’s basic cover applies by default, and that is based on weight rather than value. When you register the shipment you can insure it for the purchase value, which we recommend for electronics and other valuable items.',
        },
      },
    },
    contact: {
      eyebrow: 'GET IN',
      title: 'TOUCH',
      breadcrumb: 'Contact',
      formTitle: 'Send us a message',
      lead:
        'Questions about a shipment, a quote, or what we do? Call or e-mail us, or fill in the form below.',
      charactersToGo: '{count} characters to go.',
      addressTitle: 'Address details',
      fields: {
        name: 'Name',
        email: 'E-mail',
        subject: 'Subject',
        message: 'Message',
      },
      subjects: [
        'General question',
        'Shipping & tracking',
        'VAT-free shipping',
        'Complaint',
        'Partnership',
      ],
      errors: {
        name: 'Please enter your name.',
        emailRequired: 'Please enter your e-mail address.',
        emailInvalid: 'That e-mail address does not look right.',
        message: 'Your message must be at least 10 characters.',
        invalid: 'Please check the details you entered.',
        tooMany: 'Too many messages sent. Please try again in an hour.',
        offline: 'Sending is not working right now. Please try again later.',
      },
      submit: 'Send message',
      sending: 'Sending…',
      success:
        'Thank you! Your message has been sent — we reply within two working days.',
      details: {
        address: 'Address:',
        phone: 'Phone:',
        email: 'E-mail:',
      },
      openInMaps: 'Open in Maps',
      mapLabel: 'Location on the map',
      mapTitle: 'Map showing the location at Hertzstraat 10, Berkel en Rodenrijs',
    },
    // Notifications: the alert in the corner and the bell in the header
    // (src/components/Notifications). The words per shipment status match
    // the e-mails (backend notifications/messages.py).
    notifications: {
      title: 'Notifications',
      bell: 'Notifications',
      bellUnread: 'Notifications, {count} unread',
      readAll: 'Mark all as read',
      empty: 'You have no notifications yet.',
      open: 'View',
      closeAlert: 'Close notification',
      shipment: 'Shipment {tracking}',
      receivedItem: '{item} (from {shop})',
      confirmationRequested: '{booking} · {item} (from {shop})',
      status: {
        received: 'Your shipment has arrived at our warehouse',
        quoted: 'Your quote is ready',
        paid: 'Payment received',
        purchased: 'Your products have been purchased',
        ready_for_shipping: 'Your shipment is packed and ready to leave',
        in_transit: 'Your shipment is on its way',
        arrived: 'Your shipment has arrived',
        delivered: 'Your shipment has been delivered',
        cancelled: 'Your shipment has been cancelled',
        courier_delivered: "Your order has been delivered to our warehouse",
        courier_delivery_failed: "The courier could not deliver your order",
        courier_delayed: "Your order is delayed",
        courier_returned: "Your order is being returned to the shop",
        courier_exception: "There is a problem with your order's delivery",
        item_received: 'An item of your order has arrived at our warehouse',
        order_received: 'Your order has arrived at our warehouse',
        invoice_requested: 'We are missing the invoice of your order',
        confirmation_requested: 'Order confirmation required',
        prealert_submitted: "Your pre-alert has been registered",
        other: 'There is news about your shipment',
      },
      invoice: {
        title: 'New invoice',
        text: 'Invoice {invoice} for shipment {tracking} is ready for you.',
      },
    },

    // The FAQ page (src/pages/Faq). Which categories and questions there are,
    // in which order, and which page a question links to, is set in
    // src/pages/Faq/faqContent.js; every language must have the same keys
    // (a test checks this). {address} is filled in from src/data/company.js.
    chat: {
      ask: 'Ask our assistant',
      title: 'Assistant',
      subtitle: 'Questions, shipping costs and help with booking',
      back: 'Back to help',
      welcome: 'Hello! I am the Pay Less Shop More assistant. I can answer questions, work out shipping costs and help you fill in the booking form. How can I help?',
      suggestions: {
        costs: 'What does shipping to Curaçao cost?',
        booking: 'Help me fill in the booking form',
        how: 'How does it work?',
        parcel: 'Where is my parcel?',
      },
      placeholder: 'Type your question…',
      send: 'Send',
      thinking: 'The assistant is writing an answer',
      disclaimer: 'Answers are written by AI and may contain mistakes. Prices are an indication.',
      errors: {
        tooMany: 'You have asked a lot of questions. Please try again in a while, or contact us.',
        unavailable: 'The assistant cannot answer right now. Please try again later, or contact us.',
      },
    },
    faq: {
      title: 'Frequently asked questions',
      summary:
        'Answers to the questions we get most: about shipping, cars, pick-up and delivery, packing, local costs, insurance and payment.',
      intro: 'On this page you will find answers to frequently asked questions. Click a topic to see its questions.',
      important: {
        title: 'Important when shipping goods',
        lead: 'Because of strict customs checks on the islands, you must supply the right documents:',
        items: [
          'For new goods: an invoice.',
          'For used goods: a complete, clearly itemised packing list with their (current) values.',
          'For motor vehicles: an invoice or a statement of value. Motorbikes or scooters from Germany are not accepted.',
        ],
        after: 'Without these documents we cannot ship your goods.',
      },
      more: 'Is your question not here?',
      contactUs: 'Contact us',
      categories: {
        goods: {
          title: 'Shipping goods',
          questions: {
            appointment: {
              q: 'Do I need to make an appointment to visit the office?',
              a: 'That is not mandatory, but it is recommended. If you call in advance to let us know you are coming, we can receive you at our office at {address}.',
            },
            arrival: {
              q: 'When will I hear if my goods have arrived?',
              a: 'A few days before your goods arrive at the destination, our local agent will contact the recipient.',
            },
            container: {
              q: 'I want to ship my goods, but I don’t have enough to fill a container:',
              a: 'That is no problem at Pay Less Shop More. You can ship your goods with a groupage shipment. In this case, you share the container, and therefore the local costs, with others.',
              link: 'See our services',
            },
            volume: {
              q: 'I would like to request a quote, but I do not know how many cubic meters I have to ship:',
              a: 'You can send an email with the dimensions of your personal items. Additionally, we offer the option of visiting you free of charge and without any obligation to inspect and measure your goods.',
              link: 'Contact us',
            },
          },
        },
        car: {
          title: 'Shipping a car',
          questions: {
            pickup: {
              q: 'Does Pay Less Shop More also pick up my car?',
              a: 'No, we do not drive other people’s vehicles. Therefore, Pay Less Shop More always asks our customers to bring the vehicles to our warehouse in Rotterdam. If you have no other way to transport the car, please contact us to discuss the possibilities.',
            },
            cargo: {
              q: 'Am I allowed to transport items in my car?',
              a: 'Yes, you may transport goods in your car. The condition for this is that the car remains drivable and that you provide a packing list of all goods located in the car.',
            },
            deregister: {
              q: 'Will my car be deregistered by Pay Less Shop More?',
              a: 'Pay Less Shop More deregisters the car with the RDW for you. For this, we need all your car documents and a copy of your ID. You will then receive the car documents back, possibly by post.',
            },
          },
        },
        pickupDelivery: {
          title: 'Pick up & deliver goods',
          questions: {
            home: {
              q: 'Does Pay Less Shop More also pick up goods from my home?',
              a: 'Pay Less Shop More also picks up goods at the address of your choice. The price for this depends on the volume of the goods in m³ and your place of residence.',
            },
            webshop: {
              q: 'If I order goods from a company, can I send them directly to your warehouse?',
              a: 'This is possible. Please communicate clearly with us when we can expect these goods. You can find our opening hours and contact details under Contact.',
              link: 'Go to Contact',
            },
            weekend: {
              q: 'Does Pay Less Shop More also pick up my goods on weekends?',
              a: 'No, this is not standard practice. You can contact one of our employees to discuss the options for this.',
            },
            delivery: {
              q: 'Does Pay Less Shop More also deliver my goods to the address I provide?',
              a: 'Our service extends to the port of destination. It is possible for your goods to be delivered to the address of your choice. We can pass this on to our local agent, and they will arrange it.',
            },
          },
        },
        packing: {
          title: 'Packing goods',
          questions: {
            seaworthy: {
              q: 'How do I ensure my goods are packed for seaworthiness?',
              a: 'You can use the packing service of Pay Less Shop More, which also includes the supply of the correct materials. You can also pack the goods yourself. When you book a shipment, you choose who does the packing.',
              link: 'Book a shipment',
            },
          },
        },
        localCosts: {
          title: 'Local costs',
          questions: {
            what: {
              q: 'What do local costs entail?',
              a: 'Local costs are costs incurred at the destination, such as unloading the container. These costs are settled with the local agent and are not included in our quoted prices.',
            },
            emigrate: {
              q: 'Do I also pay local costs if I emigrate?',
              a: 'You do pay local costs, but you can import your goods duty-free. To do this, you must be deregistered in the Netherlands and registered in the country of destination. You can find more information under destinations.',
              link: 'See the destinations',
            },
            prepay: {
              q: 'Why can’t I pay the local costs at the destination in advance?',
              a: 'It is difficult for us to estimate what the local costs will be. In some cases, customs determines the value of the goods, which means we can never provide certainty regarding the amount of these costs.',
            },
          },
        },
        insurance: {
          title: 'Insurance',
          questions: {
            insured: {
              q: 'Are my goods insured?',
              a: 'Your goods are not insured by default. It is possible to take out transport insurance through Pay Less Shop More. Contact us for more information.',
              link: 'Contact us',
            },
            damage: {
              q: 'What happens if my goods are damaged?',
              a: 'Damage during shipping is not covered if you have not taken out transport insurance.',
              link: 'Ask about insurance',
            },
          },
        },
        payment: {
          title: 'Pay',
          questions: {
            how: {
              q: 'How does the payment process work?',
              a: 'When your goods are collected (if applicable), you can settle the invoice in cash or by bank transfer. If you require a guaranteed spot on the boat, you are required to make a down payment (in consultation). The full amount must always be paid before the goods depart from Rotterdam.',
            },
          },
        },
      },
    },

    // The Terms & Conditions page (src/pages/Terms). Only the page around the
    // conditions is translated: the conditions themselves are in English in
    // src/data/terms.js (legal text, the Dutch original prevails).
    terms: {
      title: 'Terms and conditions',
      summary:
        'The forwarding and warehousing conditions of Pay Less Shop More: the terms that apply to every shipment and to storage in our warehouse.',
      languageNote:
        'These conditions are shown below in English. If the English text differs from the Dutch text, the Dutch text prevails.',
      contents: 'Contents',
      article: 'Article',
      section: 'Section',
      incomplete: 'The rest of these conditions will be added soon. Contact us if you need the full text.',
      questions: 'Do you have a question about these conditions? Contact us via',
      backToTop: 'Back to top',
    },

    // The privacy statement (src/pages/Privacy). The order of the sections
    // is set in Privacy.jsx; every language must have the same keys and the
    // same number of items in each list (a test checks this).
    // {address} and {number} are filled in from src/data/company.js.
    privacy: {
      title: 'Privacy policy',
      summary:
        'How Pay Less Shop More handles your personal data: what we collect, why, who we share it with and what your rights are.',
      questions: 'Do you have a question about this privacy policy? Get in touch through',
      intro: [
        'Your privacy is important to us at Pay Less Shop More. We use your personal data solely to manage your account and provide our services to you. We attach great importance to the protection, confidentiality and integrity of your personal data. In this privacy statement, we explain what personal data we collect when you use our services, why we need this data, and how we use it.',
      ],
      sections: {
        services: {
          heading: 'Our services',
          body: [
            'Pay Less Shop More offers the transport of your goods as a freight forwarder. This privacy statement applies to these services and the related platforms.',
          ],
        },
        data: {
          heading: 'Which personal data is collected?',
          body: [
            'We need certain personal data to provide you with the best possible service and to inform you about our services.',
            'When you use the services of Pay Less Shop More, we process the following data:',
          ],
          list: [
            'First and last name',
            'Email address',
            'Phone number',
            'Residential address',
            'Company name (if applicable)',
          ],
        },
        thirdParties: {
          heading: 'Third parties',
          body: [
            'We also receive information from third parties with whom we collaborate. Although our partners may change, these are:',
          ],
          list: [
            'Our agents at the various destinations, namely: Fast Delivery Services, Anper NV and Cavalier Logistics.',
            'Suppliers who will deliver goods to you, which we will then forward for you.',
          ],
        },
        purposes: {
          heading: 'How do we use your personal data?',
          body: [
            'We use your personal data exclusively for the purposes for which it was collected, and where applicable, to comply with legal obligations. We use your personal data for the following purposes:',
          ],
          items: [
            {
              term: 'Execution of the agreements.',
              text: 'We process your personal data to provide you with the services of your choice.',
            },
            {
              term: 'Customer contact and communication.',
              text: 'We use your data to communicate with you via email or telephone in connection with our services. This allows you to receive invoices from us and enables us to keep you informed about your shipment and to invite you to participate in customer satisfaction surveys.',
            },
            {
              term: 'Marketing.',
              text: 'We would like to keep you informed about our services via email or social media. You have the right to unsubscribe from this information at any time.',
            },
            {
              term: 'Safety, security and dispute resolution.',
              text: 'We use your data to ensure the safety, integrity and protection of our services and customers. Where appropriate, we may use your data in the context of dispute resolution, to enforce compliance with the agreement with you, to enforce our rights against third parties, or to defend ourselves against claims or allegations from third parties.',
            },
            {
              term: 'Legal obligations.',
              text: 'We may process your information to comply with legal obligations, for example maintaining records or complying with legitimate requests from competent authorities (e.g. police or justice).',
            },
            {
              term: 'Improving and personalising our services.',
              text: 'We use your personal data to improve our services. For example, insights into click behaviour and search results on our website can help us optimise our services.',
            },
            {
              term: 'Maintenance, development and incident management.',
              text: 'If you experience problems with one of our services, we may need to process personal data to reach a solution. We also process your personal data for certain internal operational processes, for example when transferring customer data to a new database.',
            },
            {
              term: 'Execution of general business processes, internal management and management reporting.',
              text: 'To carry out our business activities, we use your personal data for general business processes. For example, we process your data for archiving purposes, insurance, management reports, audits and other administrative purposes.',
            },
          ],
        },
        sharing: {
          heading: 'With whom do we share your personal data?',
          body: [
            'We share your personal data with third parties, such as agents at your destination and other partners, depending on the services you use. We share your data:',
          ],
          list: [
            'To the extent necessary to carry out our business activities, provide our services and enable our partner services. This includes, for example, being able to carry out certain transports, for instance by air freight, and being able to communicate with you in connection with our services;',
            'In cases where you have explicitly given us permission to do this;',
            'If we are lawfully requested to do so in the context of law enforcement, for example for investigations into illegal activities;',
            'To enforce our agreement with you, where applicable. For example, if you have not paid for our services, we may share your information with a debt collection agency;',
            'To enforce our rights against third parties or to defend ourselves against claims or allegations by third parties;',
            'To ensure the safety, integrity and protection of our services.',
          ],
          after: [
            'The sharing of data within the company takes place exclusively for the purpose of our business activities, our services to you, and as described in this privacy statement.',
          ],
        },
        location: {
          heading: 'Where is your personal data processed?',
          body: [
            'Your personal data is primarily processed by our staff at our office in the Netherlands. Depending on your location and where applicable, certain data may be processed by local agents (such as in Curaçao), for example for local handling or local marketing campaigns.',
            'To the extent that we transfer personal data to a country outside the European Union or to an international organisation, we ensure that this occurs exclusively to those countries and organisations that guarantee adequate protection of your data and rights in accordance with the General Data Protection Regulation (GDPR), or if this is otherwise permitted under the GDPR.',
          ],
        },
        retention: {
          heading: 'How long do we retain your personal data?',
          body: [
            'We retain your personal data only for as long as it is necessary for the purposes for which it was collected or is used and/or as long as required by law.',
            'If you wish to have your data deleted, please contact our office. Upon request, we will delete your personal data without undue delay, with the exception of information that we are legally obliged to retain. For example, we are legally required to retain data such as copies of invoices for seven years.',
          ],
        },
        loginMonitoring: {
          heading: 'Security and sign-in monitoring',
          body: [
            'To protect our platform and your account, we record every sign-in attempt, successful or failed. For each attempt we keep the account or e-mail address that was entered, your IP address, the country and city that roughly belong to it, the time, the type of browser, operating system and device, and the way you signed in. We never store passwords, PINs or codes, not even wrong ones.',
            'The purpose is to detect misuse, for example many failed attempts or a sign-in from an unexpected device. Only office staff with an administrator role can see this data. An unusual place or a new device is only a signal for us to take a look, not proof of misuse, and we make no automated decisions about your account on that basis.',
            'We work out the place approximately from your IP address. We never use GPS or your device\'s location. For that, your IP address may be submitted to a geolocation service (ipwho.is). We keep these sign-in records for at most 90 days and delete them afterwards. Our legal basis is our legitimate interest in the security of our services and of your account.',
          ],
        },
        legalBasis: {
          heading: 'Legal basis for data processing',
          body: [
            'We collect and process your personal data only when we have a legal basis for doing so. The following legal bases apply:',
          ],
          list: [
            'The processing is necessary for the performance of your agreement;',
            'The processing is necessary for the pursuit of our legitimate business interests, for example i) to carry out our business activities; ii) for certain forms of direct marketing and profiling; iii) to archive information about your account so that you can reactivate it at a later time; iv) to detect or prevent fraud or abuse of our services; or v) for the security of our network and systems;',
            'The processing is necessary to comply with a legal obligation, such as the retention obligation for administrative data or to share certain information following a police order for a criminal investigation;',
            'You have explicitly given us permission for the processing, for example for sharing data with partners for commercial purposes.',
          ],
          after: [
            'When the processing is based on consent, you have the right to withdraw your consent at any time. In that case, we will terminate the relevant processing of your data. Withdrawing consent does not affect the lawfulness of processing based on consent prior to its withdrawal.',
          ],
        },
        complaints: {
          heading: 'Questions and complaints',
          body: [
            'If you have questions about how we use your personal data, you can contact our office.',
            'If you feel that a problem has not been adequately addressed, you also have the right to file a complaint with the Dutch Data Protection Authority (Autoriteit Persoonsgegevens).',
          ],
        },
        controller: {
          heading: 'Responsible entity',
          body: ['Pay Less Shop More is a freight forwarder established at {address}.'],
          // Only shown once the number is filled in, in src/data/company.js.
          registration: 'Pay Less Shop More is registered with the Chamber of Commerce under number {number}.',
          after: [
            'Decisions regarding the purposes and means of the processing of personal data are in principle made centrally at Pay Less Shop More, which acts as the data controller for the processing of this personal data.',
          ],
        },
      },
    },
    guide: {
      eyebrow: 'About this page',
      greeting: 'Hi! How can I help?',
      onThisPage: 'On this page',
      more: 'Read more',
      less: 'Show less',
      panelLabel: 'About this page',
      openLabel: 'Open help and the guide for this page',
      hint: 'Click here for help',
      hintClose: 'Close this message',
      close: 'Close',
      listen: 'Read aloud',
      stop: 'Stop',
      dontShow: 'Stop showing this automatically',
      pages: {
        faq: {
          title: 'Frequently asked questions',
          body:
            'Answers to the questions we get most. Click a topic to see its questions and answers.',
          bullets: [
            'At the bottom you will find the documents customs asks for.',
            'Is your question not here? Contact us.',
          ],
        },
        blog: {
          title: 'Blog',
          body:
            'Tips and explanations about ordering from Dutch webshops and shipping to the islands. Click a post to read it.',
        },
        terms: {
          title: 'Terms and conditions',
          body:
            'The conditions that apply to every shipment and to storage in our warehouse. The text is in English; if it differs from the Dutch text, the Dutch text prevails.',
          bullets: [
            'Click an Article in the contents to jump straight to it.',
          ],
        },
        privacy: {
          title: 'Privacy policy',
          body:
            'What personal data we collect, why, who we share it with and what your rights are.',
        },
        home: {
          title: 'Welcome to PayLesShopMore',
          body:
            'This is where it starts. We receive your orders in the Netherlands and forward them to the island.',
          bullets: [
            'Open "Services" to see what we can do for you.',
            'Under "Destinations" you can read how it works per island.',
            'Ready to send something? Go to "Booking".',
          ],
        },
        services: {
          title: 'Our services',
          body:
            'Here you can see what we do for you, from sea and air freight to delivery on the island, and which shops our customers order from.',
          bullets: [
            'Choose your destination for the details of that island.',
            'Unsure about a product? Ask us before you order.',
          ],
        },
        booking: {
          title: 'Register a shipment',
          body:
            'With this booking form you register your shipment with us, instead of on paper. The more complete it is, the faster we can handle it.',
          bullets: [
            'Choose whether you fill in the whole form at once or step by step.',
            'For each store, choose where you ordered and what you bought there. A screenshot of your order helps.',
            'Signed in? Then the booking is in your account afterwards, under "My bookings", where you can also add the invoice or track-and-trace.',
          ],
        },
        tracking: {
          title: 'Follow your shipment',
          body:
            'Enter your tracking code and you see where your shipment is: with us in the warehouse, on its way, or ready for delivery.',
          bullets: [
            'The code is in the e-mail we sent you.',
            'Only the shipments on your account can be tracked here.',
          ],
        },
        destinations: {
          title: 'Our destinations',
          body:
            'Choose the island your shipment is going to. Each destination explains the transit time, the options and how delivery works.',
        },
        destination: {
          title: 'This destination',
          body:
            'Here is how we ship to this island and what to expect. At the bottom you can ask for a quote straight away.',
        },
        profile: {
          title: 'Your account',
          body:
            'Your details, addresses, shipments and invoices are all kept here, and so is Track & Trace.',
          bullets: [
            'Keep your delivery address current — that is where your shipment goes.',
            'Invoices and packing slips can be downloaded here.',
            'Pre-alert a parcel under "My shipments". A declared value is no longer needed.',
            'In a shipment, choose "Delivery" or "Pick it up myself". You choose only once; after that a change goes by e-mail.',
          ],
        },
        prealert: {
          title: 'Pre-alert a parcel',
          body:
            'Here you let us know that a parcel is on its way to our warehouse. That way we know it is yours as soon as it arrives.',
          bullets: [
            'The tracking number and the courier are in the shop\'s shipping e-mail.',
            'A declared value is not needed.',
            'Add the shop\'s invoice and customs goes faster.',
          ],
        },
        login: {
          title: 'Sign in',
          body:
            'Sign in with the e-mail address you registered with. Forgotten your password? Use the link under the form — the e-mail arrives within a few minutes.',
        },
        signup: {
          title: 'Create an account',
          body:
            'Fill in your name, e-mail address and a password. After that you can register shipments and follow them.',
          bullets: [
            'Use an e-mail address you read daily: everything we send goes there.',
            'You can fill in your delivery address later, in your account.',
          ],
        },
        contact: {
          title: 'Contact us',
          body:
            'Ask your question here. Mention your tracking code or order number if it is about a shipment, so we can look into it right away.',
        },
      },
    },
    // The onboarding tour (src/components/Tutorial) and its "?" help button.
    // Steps: onboarding.steps.<id> must match the ids in
    // src/components/Tutorial/tutorialSteps.js. Each step has a `title` and
    // optionally `text`, `points` (bullet list), `note` and `warning`.
    // Shipping times are NOT here: they come from src/data/destinations.js.
    onboarding: {
      stepOf: 'Step {current} of {total}',
      progressLabel: 'Tour progress',
      duration: 'About 2 minutes',
      start: 'Start tutorial',
      skip: 'Skip tutorial',
      close: 'Close tutorial',
      back: 'Back',
      next: 'Next',
      finish: 'Finish',
      openWebsite: 'Open website',
      steps: {
        welcome: {
          title: 'Welcome to Pay Less Shop More',
          text: "Let's take a quick tour and show you how shopping and shipping works.",
        },
        account: {
          title: 'Create your account',
          text: 'Create your Pay Less Shop More account so you can manage your orders, shipments, and personal information.',
          points: [
            'Use the "Sign up" button at the top of the page. On a phone, you find it in the menu (☰).',
            'Enter your own personal information: your own name, email address and phone number.',
          ],
        },
        shop: {
          title: 'Shop at your favorite stores',
          text: 'Buy products from Dutch online stores and have your purchases delivered to our warehouse in the Netherlands.',
          points: [
            'At checkout, use the Pay Less Shop More warehouse address as the delivery address. The next step shows you exactly what to enter.',
          ],
          note: 'Pay for your order straight away. Paying afterwards is not allowed.',
        },
        address: {
          title: 'Send your order to our warehouse',
          text: 'When ordering from a Dutch webshop, use this address for both the billing details and the delivery address.',
          warning: 'Make sure you enter the warehouse address exactly as shown, for both billing and delivery. If it is not filled in correctly, we cannot process your shipment.',
        },
        // {email} is filled in from src/data/company.js.
        register: {
          title: 'Register your shipment with us',
          text: 'After ordering, let us know that a parcel is on its way to our warehouse. That way we know it is yours as soon as it arrives.',
          points: [
            'Pre-alert the parcel in your account (My shipments), with the tracking number and the courier.',
            'Add the invoice from the webshop, so customs goes faster.',
          ],
        },
        warehouse: {
          title: 'Your package arrives at our warehouse',
          text: 'Once your package arrives at our warehouse, we process it and prepare it for shipping to your destination.',
        },
        shipping: {
          title: 'Choose your shipping method',
        },
        track: {
          title: 'Track your shipment',
          text: 'Use Track & Trace to check the latest available information about your shipment.',
          points: [
            'Track & Trace is in your account: log in and click your name at the top of the page.',
            'Information appears as soon as it is available for your shipment.',
          ],
        },
        // The "Feedback" tab on the right edge (components/Feedback).
        feedback: {
          title: 'Tell us what you think',
          text: 'With the yellow "Feedback" button on the right of every page you can give us stars and a comment. After a delivery we also ask you to rate it.',
        },
        help: {
          title: 'Need help?',
          text: 'Our team is happy to help with questions about:',
        },
      },
      address: {
        firstName: 'First name',
        lastName: 'Last name',
        street: 'Address',
        postcode: 'Postal code',
        city: 'City',
        country: 'Country',
        countryValue: 'Netherlands',
        copy: 'Copy address',
        copied: 'Address copied!',
        copyFailed: 'Copying did not work. Please select the address and copy it yourself.',
      },
      flow: {
        label: 'From the online store to your destination',
        store: 'Online store',
        warehouse: 'Pay Less Shop More warehouse',
        shipping: 'Shipping',
        destination: 'Your destination',
      },
      shipping: {
        allIslands: 'All islands',
        faster: 'The fastest option.',
        disclaimer: 'These are estimates. The actual time depends on the shipping schedule and circumstances.',
        quoteQuestion: 'Want to know the price?',
        quoteLink: 'Choose your island and request a quote',
      },
      help: {
        topics: [
          'Shipping costs',
          'Customs',
          'Large items',
          'Business shipping',
          'Other destinations',
          'General questions',
        ],
        contact: 'Contact our team:',
        again: 'On any page, click the robot in the bottom-left corner and choose "Tour this page": it explains that page. On the home page it starts this tour again.',
        doneTitle: "You're all set!",
        doneText: 'You now know the basics of shopping and shipping with Pay Less Shop More.',
      },
      // The page tours: one per page, started from the robot's "Tour this
      // page". The step ids match pageTours in
      // src/components/Tutorial/tutorialSteps.js.
      pages: {
        // The warehouse tour (pageTours.warehouse in tutorialSteps.js).
        warehouse: {
          welcome: {
            title: 'Welcome to the warehouse',
            text: 'A quick tour of how the warehouse works. It takes about a minute; you can stop at any time.',
            points: [
              'Scan a package and work through it step by step',
              'Start an intake sheet for goods that arrive',
              'See every package that is in the warehouse',
            ],
          },
          scan: {
            title: 'Scan Package',
            text: 'Start here when a box arrives or when you pick one up. Scan the barcode or QR code on the label with the camera, or type the tracking number.',
          },
          package: {
            title: "The package's own page",
            text: 'After scanning, the package opens. Work from top to bottom:',
            points: [
              'Verify: check the details against the label',
              'Measure: weight, length, width and height',
              'Already measured on the intake sheet? Then Measure is skipped',
              'Ready: mark it ready for shipping',
              'That is also where you report damage (with photos), resolve it, and print the label',
            ],
          },
          newSheet: {
            title: 'New intake sheet',
            text: 'For goods that arrive without a code to scan, or a delivery of several boxes. It opens a blank intake form.',
          },
          intake: {
            title: 'The intake form',
            text: 'Step by step (or choose "Whole form" at the top). Next saves your work:',
            points: [
              'Shipment: the shipment number is fixed; scan the label and tap the names into Afzender, Ontvanger, ...',
              'Schade aanwezig? Ja: take photos of the damage',
              'Measure: one line per size of box. It counts for the package too, so you measure only once',
              'Release and e-mail the team when it is complete',
            ],
            note: 'Save draft keeps your work; nothing is sent until you release it.',
          },
          list: {
            title: 'Packages in the warehouse',
            text: 'The packages of the tile you chose, oldest first. Tap one to open its page; a coloured label says why it needs attention. The search box looks through every package, also ones that have already left.',
          },
          filters: {
            title: 'The numbers',
            text: 'How many packages are in the warehouse, how many need attention, are ready to ship and are on the way. Tap a tile to see those packages in the list below.',
          },
          menu: {
            title: 'The menu',
            text: 'On the left, or along the bottom on a phone:',
            points: [
              'Home: this page',
              'Scan: the scanner',
              'Intake sheets: every intake form, also earlier ones',
              'Profile: your details, PIN and handover e-mails',
            ],
          },
          help: {
            title: 'Want to see this again?',
            text: 'Press Guide at any time to start this tour again.',
          },
        },
        // The office dashboard tour (pageTours.dashboard in tutorialSteps.js).
        dashboard: {
          welcome: {
            title: 'Welcome to the dashboard',
            text: 'A quick tour of the office dashboard. It takes about a minute; you can stop at any time.',
            points: [
              'Where to find new quotes, bookings and messages',
              'How to manage shipments, invoices and customers',
              'Where to find this guide again later',
            ],
          },
          overview: {
            title: 'Overview',
            text: 'Start here every day. It shows what is waiting, the numbers for the chosen period and what the warehouse reports. Deal with anything red (damage, needs attention) first.',
          },
          sales: {
            title: 'Sales',
            text: 'The work that comes in through the website:',
            points: [
              'Quotes: requests from the destination pages. Set the status to Quote sent, Accepted or Declined',
              'Bookings: fill in the shipping number, volume and weight, then confirm or mark as Shipped',
              'Messages: reply by e-mail, then mark as handled',
            ],
            note: 'The number next to a menu item is how many are still waiting.',
          },
          shipments: {
            title: 'Shipments',
            text: 'Packages: move each package through its steps, from Quote sent and Paid to Delivered. In transit and Delivered fill in the date by themselves. Measurements: what the warehouse measured and weighed.',
          },
          billing: {
            title: 'Billing',
            text: 'An invoice is made by itself when a package is marked Paid. Check it and approve it (the customer then gets it) or reject it with a reason. Documents holds the receipts and forms customers upload.',
          },
          people: {
            title: 'People',
            text: 'Everyone with an account:',
            points: [
              'Customers: search, correct details, open or delete an account',
              'Workers: colleagues, their role, and warehouse sign-in codes',
              'Warehouse access and Floor devices: what the warehouse may see, and the shared phones and scanners',
            ],
            note: 'Only an admin can change roles and delete accounts.',
          },
          website: {
            title: 'Website',
            text: 'Shops and blog. What you save here is live on the website straight away. A blog post stays hidden until you tick Published.',
          },
          warehouse: {
            title: 'Warehouse',
            text: 'These links open the warehouse app: scanning, intake sheets and each package\'s own page. It has a tour of its own.',
          },
          search: {
            title: 'Search',
            text: 'Searches the list you are on: a name, e-mail or tracking number. A full tracking number (or a scan) opens that package straight away.',
          },
          foot: {
            title: 'Your account',
            text: 'Shows which account and role you are signed in with, with links to the Django admin, back to the website, and Sign out.',
          },
          help: {
            title: 'Want to see this again?',
            text: 'Press Guide in the top bar. On every other page, Guide explains that page.',
          },
        },
        // The Customers page tour (pageTours.dashboardCustomers).
        dashboardCustomers: {
          intro: {
            title: 'Customers',
            text: 'Everyone who ships with us. These are the same details customers see on their own profile page, so a fix you make here is what they see too.',
          },
          filters: {
            title: 'Search and filter',
            text: 'Search by name, e-mail, phone or city. Account picks active or erased accounts; Role shows colleagues as well.',
          },
          create: {
            title: 'New account',
            text: 'Open an account for someone. Fill in name, e-mail and phone; they get an e-mail to choose their own password. You never see it.',
          },
          table: {
            title: 'The table',
            text: 'Each customer\'s contact details, addresses, shipments, and what is paid and still open.',
            points: [
              'Edit details: correct the name, e-mail, phone and addresses',
              'Role: pick another role, it saves straight away',
            ],
          },
          delete: {
            title: 'Deleting an account',
            text: 'With the red Delete button on the far right. Without shipments the account is removed completely. With shipments only the personal details are erased; the shipments and invoices are kept.',
            note: 'This cannot be undone.',
          },
        },
        // The Invoices page tour (pageTours.dashboardInvoices).
        dashboardInvoices: {
          intro: {
            title: 'Invoices',
            text: 'An invoice appears here by itself as soon as a package is marked Paid. Every invoice has to be approved before the customer sees it.',
          },
          filters: {
            title: 'Search and filter',
            text: 'Search by customer, invoice number or tracking number. Status shows, for example, only what is waiting for review; Customer shows one customer\'s invoices.',
          },
          table: {
            title: 'The list',
            text: 'Each invoice\'s number, customer, shipment, date, amount and status. Invoices waiting for review are highlighted.',
            points: [
              'Pending review: you need to check it',
              'Approved: done, but the customer cannot see it yet',
              'Rejected: the reason is shown under it',
              'Sent: it is on the customer\'s profile page',
            ],
          },
          review: {
            title: 'Reviewing',
            text: 'Click View to open the invoice and check the lines, amounts and customer.',
            points: [
              'Approve: the PDF is made and the invoice goes on the customer\'s profile',
              'Reject: write what is wrong, so it can be fixed',
              'Send to customer: for an approved invoice that already has a document',
            ],
            note: 'Who approved or rejected each invoice, and when, is recorded.',
          },
          new: {
            title: 'New invoice',
            text: 'Write an invoice yourself in the invoice editor, for example for a shipment that never went through Paid.',
          },
          upload: {
            title: 'Upload PDF',
            text: 'Already have the invoice as a PDF? Upload it here. Uploading approves the invoice in your name and puts it on the customer\'s profile.',
          },
          settings: {
            title: 'Settings',
            text: 'The lists the invoice editor picks from: ports and charge types (such as freight, insurance, handling). Only an admin can change them.',
          },
        },
        // The Quotes page tour (pageTours.dashboardQuotes).
        dashboardQuotes: {
          intro: {
            title: 'Quote requests',
            text: 'Requests visitors send from the destination pages. What the visitor sent cannot be changed, only the status.',
          },
          filters: {
            title: 'Search and filter',
            text: 'Search by name, e-mail or destination. Status shows, for example, only the new requests.',
          },
          table: {
            title: 'The list',
            text: 'New requests are highlighted. Click a name to read the whole request and its attached document.',
          },
          open: {
            title: 'Handling one',
            text: 'Send the quote by e-mail, then set the status:',
            points: [
              'New: not looked at yet',
              'Quote sent: the quote has gone out',
              'Accepted or Declined: what the customer decided',
            ],
          },
        },
        // The Bookings page tour (pageTours.dashboardBookings).
        dashboardBookings: {
          intro: {
            title: 'Bookings',
            text: 'Booking forms from the website. What the sender filled in is read-only; the shipping number, volume, weight and packing check are yours to fill in.',
          },
          filters: {
            title: 'Search and filter',
            text: 'Search by shipping number, sender, recipient or contents.',
          },
          table: {
            title: 'The list',
            text: 'New bookings are highlighted. Open a booking to see its details and fill in your fields.',
          },
          status: {
            title: 'The status',
            text: 'How a booking moves on:',
            points: [
              'Confirmed: moves from the customer\'s "My bookings" to "My shipments"',
              'Shipped: the customer sees the shipment as "On the way"',
              'Cancelled: cancels it',
            ],
          },
        },
        // The Messages page tour (pageTours.dashboardMessages).
        dashboardMessages: {
          intro: {
            title: 'Messages',
            text: 'Everything sent through the contact form.',
          },
          filters: {
            title: 'Search and filter',
            text: 'Search by name, e-mail or subject. Handled shows only what is not handled yet.',
          },
          table: {
            title: 'Handling one',
            text: 'Open a message and reply by e-mail. Then use Mark handled, so your colleagues know it is done.',
            note: 'Marking it handled sends nothing to the customer.',
          },
        },
        // The Packages page tour (pageTours.dashboardPackages).
        dashboardPackages: {
          intro: {
            title: 'Packages',
            text: 'Every customer\'s shipments. New packages are made in the Django admin.',
          },
          filters: {
            title: 'Search and filter',
            text: 'Search by tracking number, description or customer, and filter by status. A full tracking number in the top bar opens the package straight away.',
          },
          table: {
            title: 'The list',
            text: 'Each package\'s tracking, customer, destination, weight and value, dates and status. Packages waiting on you are highlighted. History shows who did what.',
          },
          status: {
            title: 'Changing the status',
            text: 'Pick the new status in the package\'s row:',
            points: [
              'Quote sent, Paid (an invoice is made by itself), Products purchased',
              'Ready for shipping, In transit, Arrived at destination, Delivered',
              'In transit and Delivered fill in the date by themselves',
            ],
            note: 'A package that has left cannot be changed; a later purchase goes on a new shipment.',
          },
        },
        // The Measurements page tour (pageTours.dashboardMeasurements).
        dashboardMeasurements: {
          intro: {
            title: 'Measurements',
            text: 'What the warehouse measured and weighed, per intake sheet.',
          },
          filters: {
            title: 'Search and filter',
            text: 'Search by reference, supplier, sender or destination, and filter by status and freight (sea or air).',
          },
          table: {
            title: 'The list',
            text: 'Each sheet\'s lines, colli, m³, weight and chargeable weight. Totals count complete lines only. Open a sheet to change its lines.',
          },
        },
        // The Documents page tour (pageTours.dashboardDocuments).
        dashboardDocuments: {
          intro: {
            title: 'Documents',
            text: 'What customers upload on their profile page: receipts, shop invoices, customs forms.',
          },
          filters: {
            title: 'Search and filter',
            text: 'Search by customer, note, filename or tracking number. Kind picks the type of document; Filed shows what is not on a shipment yet.',
          },
          table: {
            title: 'Filing on a shipment',
            text: 'A document can arrive before the parcel does. Pick the right shipment in the Shipment column once the parcel is booked.',
          },
        },
        // The Workers page tour (pageTours.dashboardWorkers).
        dashboardWorkers: {
          intro: {
            title: 'Workers',
            text: 'Everyone who works here, grouped by role. The role decides who can open the dashboard, the warehouse scanner, or neither.',
          },
          new: {
            title: 'New colleague',
            text: 'Make an account for a colleague and pick their role. They get an e-mail to choose their own password.',
            note: 'Only an admin sees this button.',
          },
          code: {
            title: 'Send sign-in code',
            text: 'Sends a warehouse worker a four-digit code. It works once, for 15 minutes. Straight after, they choose their own PIN for the floor devices.',
          },
          table: {
            title: 'The list',
            text: 'Each worker\'s details, role and PIN status.',
            points: [
              'PIN set, No PIN or PIN locked',
              'Reset PIN: for a forgotten or locked PIN; then send a new code',
              'Role: only an admin can change roles',
            ],
          },
        },
        // The WarehouseAccess page tour (pageTours.dashboardWarehouseAccess).
        dashboardWarehouseAccess: {
          intro: {
            title: 'Warehouse access',
            text: 'What warehouse workers may see and use in the warehouse app. Office staff and admins are never limited.',
          },
          switches: {
            title: 'On and off',
            text: 'Switch a part off and it disappears from their screens; the server refuses it too. Scanning, the package list and the package page always stay on.',
            note: 'Only an admin can change these.',
          },
        },
        // The FloorDevices page tour (pageTours.dashboardFloorDevices).
        dashboardFloorDevices: {
          intro: {
            title: 'Floor devices',
            text: 'Shared phones and scanners where a warehouse worker signs in by tapping their name and typing their PIN. A PIN works on these devices only.',
          },
          register: {
            title: 'Register this device',
            text: 'Open this page on the device itself, give it a name (for example "Packing table phone") and register it.',
          },
          table: {
            title: 'Devices',
            text: 'Every registered device. Click Revoke on one that is lost or broken; PINs stop working on it.',
          },
          log: {
            title: 'Who signed in where',
            text: 'Who signed in on which device, and when. Useful when someone seems to be working under another person\'s name.',
          },
        },
        // The Shops page tour (pageTours.dashboardShops).
        dashboardShops: {
          intro: {
            title: 'Shops',
            text: 'The webshops on the services page. What you save is live straight away.',
          },
          add: {
            title: 'Add a shop',
            text: 'Fill in the name, link, description and logo, and save.',
          },
          table: {
            title: 'The list',
            text: 'Edit a shop right in the table.',
            points: [
              '↑: moves a shop up the order',
              'Shown: untick to hide it from the website without deleting it',
            ],
          },
        },
        // The Blog page tour (pageTours.dashboardBlog).
        // Added 2026-10: the pages that had no tour yet (tutorialSteps.js).
        calculator: {
          intro: {
            title: "Shipping calculator",
            text: "Fill in where it goes, what it cost, its size and weight, and sea or air. You get an indication of the costs straight away.",
          },
          result: {
            title: "The result",
            text: "Each cost is shown once its price is known. Want a fixed price? Ask for a quote under the result; your details are already filled in.",
          },
        },
        forgotPassword: {
          intro: {
            title: "Forgot your password?",
            text: "Type the e-mail address of your account and we send you a link to choose a new password.",
          },
          next: {
            title: "Then",
            text: "Open the e-mail and click the link within an hour. No e-mail? Check your spam folder, or try again in a few minutes.",
          },
        },
        resetPassword: {
          intro: {
            title: "Choose a new password",
            text: "Type your new password twice. Use at least 12 characters, and not one you use elsewhere.",
          },
          next: {
            title: "Then",
            text: "You are signed out everywhere, for safety. Sign in with your new password.",
          },
        },
        twoFactor: {
          intro: {
            title: "Code from your app",
            text: "After your password, type the 6-digit code from your authenticator app. The first time, you scan a QR code to set it up.",
          },
          lost: {
            title: "Lost your phone?",
            text: "Type one of your recovery codes instead. No codes left? Ask an admin to reset two-factor for you.",
          },
        },
        warehouseScan: {
          intro: {
            title: "Scanner",
            text: "Point the camera at the code on the box, or type the code if the label is damaged.",
          },
          result: {
            title: "What you get",
            text: "Scanning a package that was expected receives it automatically. Then open it to measure, pack and mark it ready.",
          },
        },
        warehousePackage: {
          intro: {
            title: "The package",
            text: "Check the details against the label on the box in front of you.",
          },
          steps: {
            title: "Step by step",
            text: "Measure it, add the packaging, and mark it packed. The page shows which step you are on.",
          },
          automatic: {
            title: "The status moves by itself",
            text: "Scanning receives it, measuring moves it on, and once it is packed with nothing open it becomes Ready for shipping. Use Move to only to correct a mistake.",
          },
          extra: {
            title: "Photos and history",
            text: "Take photos for the customer, report damage, and open the history and all details at the bottom.",
          },
        },
        warehouseIntake: {
          intro: {
            title: "Intake sheet",
            text: "The form for goods that arrive, in the same order as the paper form.",
          },
          release: {
            title: "Hand it over",
            text: "When the sheet is complete, release it: the office gets it and the shipment can be invoiced.",
          },
        },
        warehouseProfile: {
          intro: {
            title: "Your page",
            text: "Who you are signed in as, what you handed over, and the sheets still waiting for you.",
          },
          tools: {
            title: "Handy tools",
            text: "The calculator, the handover e-mail setting and your password are here too.",
          },
        },
        warehousePin: {
          intro: {
            title: "Your PIN",
            text: "Choose a 4-digit PIN. With it you sign in on the warehouse devices by tapping your name.",
          },
        },
        dashboardInvoiceEditor: {
          intro: {
            title: "Invoice editor",
            text: "Choose the customer and shipment, then fill in the charges. Totals are worked out for you.",
          },
          preview: {
            title: "Preview",
            text: "The invoice on the right is exactly what gets printed. Download or print it from the buttons below the form.",
          },
          save: {
            title: "Save",
            text: "Save it for review, or send it to the customer straight away.",
          },
        },
        dashboardInvoiceSettings: {
          intro: {
            title: "Invoice settings",
            text: "Company details, bank details and texts that appear on every invoice. A change applies to invoices made from now on.",
          },
        },
        dashboardPreAlerts: {
          intro: {
            title: "Pre-alerts",
            text: "Parcels customers told us are on their way to our warehouse.",
          },
          filters: {
            title: "Search and filter",
            text: "Search by reference, tracking number, customer or shop, or filter by status.",
          },
        },
        dashboardCourierTracking: {
          intro: {
            title: "Courier tracking",
            text: "Every courier number: incoming to our warehouse and outgoing to the island.",
          },
          filters: {
            title: "Search and filter",
            text: "Search by tracking number, customer or shop, or show only problems.",
          },
          details: {
            title: "Opening a shipment",
            text: "Click a tracking number: see what the customer sees, add an update, correct a wrong one, or correct the number itself.",
          },
        },
        dashboardSecurity: {
          intro: {
            title: "Security",
            text: "Decide whether two-factor sign-in is off, optional or required.",
          },
          modes: {
            title: "The modes",
            text: "Set it up on your own account first. Saving asks for your password and shows who is affected.",
          },
          history: {
            title: "History",
            text: "Every change to two-factor sign-in is listed at the bottom.",
          },
        },
        driver: {
          intro: {
            title: "Your deliveries",
            text: "The shipments waiting to be handed over, with the customer's phone and address one tap away.",
          },
          deliver: {
            title: "Delivered",
            text: "Tap Delivered, fill in who took it and, if you can, take a photo. Today shows what you delivered.",
          },
        },
        dashboardBlog: {
          intro: {
            title: 'Blog',
            text: 'The posts on the website\'s blog.',
          },
          new: {
            title: 'New post',
            text: 'Write a new post. Leave Published unticked while it is a draft; drafts are hidden from visitors.',
          },
          table: {
            title: 'The list',
            text: 'Click a post to edit it. Tick Published and save: it is on /blog straight away.',
          },
        },
        faq: {
          topics: { title: 'The topics', text: 'Click a topic, like "Shipping a car" or "Pay", to see its questions and answers. Click it again to close it.' },
          important: { title: 'Documents for customs', text: 'Read this before you send anything: without the right documents we cannot ship your goods.' },
          more: { title: 'Question not here?', text: 'Contact us, we are happy to help.' },
        },
        blog: {
          intro: { title: 'The blog', text: 'Here we write tips and explanations about ordering and shipping to the islands.' },
          posts: { title: 'The posts', text: 'Click a post to read all of it.' },
        },
        blogPost: {
          article: { title: 'The post', text: 'At the top are the date and a short summary, with the whole post below.' },
          cta: { title: 'Ready to ship?', text: 'See the destinations or contact us.' },
          back: { title: 'Read more', text: 'This link takes you back to all posts.' },
        },
        terms: {
          note: { title: 'In English', text: 'The conditions are in English. If they differ from the Dutch text, the Dutch text prevails.' },
          contents: { title: 'Contents', text: 'Click an Article to jump straight to it.' },
          conditions: { title: 'The conditions', text: 'First the Forwarding Conditions, which apply to every shipment. Then the Warehousing Conditions, for storage in our warehouse.' },
          contact: { title: 'Questions?', text: 'Something unclear? Contact us.' },
        },
        privacy: {
          intro: { title: 'Your data', text: 'What data we collect, why, who we share it with and how long we keep it.' },
          contact: { title: 'Questions about your data?', text: 'Contact us if you have a question about your data.' },
        },
        services: {
          intro: { title: 'Our services', text: 'This page explains what we do for you, from our warehouse in the Netherlands to delivery on the island.' },
          islands: { title: 'The islands', text: 'Click an island to see how shipping there works, how long it takes, and to request a quote.' },
          offer: { title: 'What we do for you', text: 'Sea and air freight, receiving and combining your parcels, customs, and delivery on the island.' },
          partners: { title: 'Our partners', text: 'The companies we work with to get your shipment onto the island.' },
          contact: { title: 'Any questions?', text: 'Want to know what we can do for you? Use this button to get in touch.' },
        },
        booking: {
          intro: { title: 'The booking form', text: 'This is where you register your shipment with us, instead of on paper. We add the shipping number, volume and weight once your shipment reaches us.' },
          mode: { title: 'Normal or step by step', text: 'Choose "Normal form" to fill in everything on one page, or "Guided form" to do one part at a time. What you have filled in stays when you switch.' },
          shipment: { title: 'Your shipment', text: 'Choose how you are sending it (sea or air freight) and where it is going.' },
          people: { title: 'Sender and recipient', text: 'Fill in your own details here, and below them the details of the person receiving it on the island.' },
          consignment: { title: 'What you are sending', text: 'For each store, choose where you ordered and what you bought there, with a screenshot of your order if you like.' },
          insurance: { title: 'Insurance and remarks', text: 'Want to insure the shipment? Enter its value; "How does the insurance work?" shows what it costs. You can also leave a remark for us here.' },
          terms: { title: 'Terms and signature', text: 'Agree to the terms, type your name as your signature, and send the booking form.' },
        },
        contact: {
          methods: { title: 'How to reach us', text: 'Email us, call us or visit. Click one of the three to email, call, or see the way.' },
          form: { title: 'Send us a message', text: 'Rather write? Fill in this form. We reply by email.' },
        },
        destinations: {
          list: { title: 'Choose your island', text: 'Click an island. There you can read how long shipping takes and how it works, and request a quote.' },
        },
        destination: {
          facts: { title: 'At a glance', text: 'How long the crossing takes, where your shipment arrives and how delivery works.' },
          how: { title: 'How your order gets there', text: 'Step by step: from your order in the Netherlands to delivery on this island.' },
          faq: { title: 'Frequently asked questions', text: 'Answers to what people ask most about shipping to this island. Click a question to read the answer.' },
          quote: { title: 'Request a quote', text: 'Fill in your name and email address, upload your invoice, and send the request. We email you an indicative price.' },
        },
        profile: {
          details: { title: 'Your details', text: 'Your name, email address, phone number and delivery address. Keep them up to date so we can reach you.' },
          address: { title: 'Your shipping address', text: 'Enter this address as the delivery address for every order in a webshop, so the parcel comes to our warehouse. Put your own first name under "first name" and "Pay less Shop More" under "last name". The button next to a line copies that line, or copy the whole address at once.' },
          tracking: { title: 'Track & Trace', text: 'Follow your shipment here. Information appears as soon as it is available for your shipment.' },
          shipments: { title: 'My shipments', text: 'All your shipments in one list, with where each one is now.' },
          prealert: { title: 'Pre-alert a parcel', text: 'Is a parcel on its way to our warehouse? Tell us about it here with the tracking number, the courier, the shop and what is inside. A declared value is no longer needed. Add the shop\'s invoice and customs goes faster.' },
          handover: { title: 'Delivery or pick it up yourself', text: 'Click a shipment and choose how you want to receive it: "Delivery" or "Pick it up myself". You choose only once: we first ask if you are sure, then the choice is fixed. Want to change it later after all? Click our e-mail address in the shipment; the subject with your shipment number is already filled in.' },
          bookings: { title: 'My bookings', text: 'Everything you sent us with the booking form. Click a booking to see what you filled in.' },
          invoices: { title: 'My invoices', text: 'Find our invoices for your shipments here, to view or download.' },
          notifications: { title: 'Notifications', text: 'Choose which emails you want to receive from us.' },
        },
        prealert: {
          intro: { title: 'Pre-alert a parcel', text: 'Is a parcel on its way to our warehouse? Tell us about it here, so we know it is yours as soon as it arrives. Fields with a * are required.' },
          courier: { title: 'Tracking number and courier', text: 'The tracking number and the courier company (PostNL, DHL, DPD ...) are in the shop\'s shipping e-mail. We use them to follow the parcel to our warehouse.' },
          shop: { title: 'The shop', text: 'Choose the shop you bought it from. Not in the list? Choose "Another store…" and type its name.' },
          description: { title: 'What is inside?', text: 'Describe in short what is in the parcel, for example "1 motherboard and 1 power supply". A declared value is not needed.' },
          receiver: { title: 'Receiver', text: 'Your name is already filled in. Is somebody else receiving the parcel? Then fill in their name.' },
          invoice: { title: 'The invoice', text: 'Add the shop\'s invoice or order confirmation: a PDF or a photo, up to 5 files. Not required, but customs goes faster with it.' },
          confirm: { title: 'Confirm and send', text: 'Tick that you have read the list of items we do not ship, and click "Send pre-alert". You will then find it in your account under "My shipments".' },
        },
        login: {
          form: { title: 'Log in', text: 'Enter the email address and password of your account.' },
          forgot: { title: 'Forgotten your password?', text: 'Click here. We email you a link to choose a new one.' },
          signup: { title: 'No account yet?', text: 'Create one here for free. It takes about a minute.' },
        },
        signup: {
          form: { title: 'Your details', text: 'Fill in your own name, email address and phone number.' },
          password: { title: 'Choose a password', text: 'Choose a strong password. The eye button shows what you are typing.' },
          terms: { title: 'Agree and done', text: 'Agree to the terms and click the button to create your account.' },
        },
        tutorial: {
          player: { title: 'The guide, step by step', text: 'Use "Next" and "Back" to go through the steps. "Read aloud" has the robot read the step to you.' },
          written: { title: 'Every step in writing', text: 'The same steps one after another, to read at your own pace or print out.' },
          cta: { title: 'Ready to start?', text: 'Register your shipment, or contact us if you still have questions.' },
        },
      },
      helpButton: {
        label: 'Help',
        menuLabel: 'Help',
        pageTour: 'Tour this page',
        shipping: 'Shipping information',
        howToOrder: 'How to order',
        track: 'How to track my package',
        contact: 'Contact us',
      },
    },
    tutorial: {
      eyebrow: 'GUIDE',
      title: 'How it works',
      breadcrumb: 'Guide',
      lead:
        'Our assistant walks you through it step by step, from your account to delivery on the island. Rather listen? Press "Read aloud".',
      playerLabel: 'Step-by-step guide',
      stepWord: 'Step',
      previous: 'Back',
      next: 'Next',
      restart: 'Start again',
      playVoice: 'Read aloud',
      stopVoice: 'Stop reading',
      voiceUnavailable:
        'Your browser cannot read this guide aloud. The full text is written out below.',
      writtenTitle: 'Every step in writing',
      writtenLead:
        'All the steps in order, to read through at your own pace or print out.',
      address: {
        firstName: 'First name',
        firstNameValue: 'Your own first name',
        lastName: 'Last name',
        street: 'Address',
      },
      ctaTitle: 'Ready to start?',
      ctaBody:
        'Register your shipment or ask us your question — we are happy to think along with you.',
      ctaPrimary: 'Register a shipment',
      ctaSecondary: 'Contact us',
      steps: {
        account: {
          title: 'Create an account',
          body:
            'An account keeps your shipments, bookings, addresses and invoices in one place. Signing up takes a minute and is free.',
          action: 'Create an account',
        },
        quote: {
          title: 'Ask for a quote',
          body:
            'Tell us what you want to send and which island it is going to. You get an indicative price of your own, based on weight and volume.',
          bullets: [
            'Choose your destination: Aruba, Bonaire or Curaçao. We also ship to other countries in the Caribbean and Latin America; see Destinations.',
            'Describe as closely as you can what you are sending and how large it is.',
            'We send you the price and the shipping options by e-mail.',
          ],
          action: 'Request a quote',
        },
        order: {
          title: 'Order from the shop of your choice',
          body:
            'Place your order with almost any Dutch webshop. You order yourself, with your own account at that shop.',
          note: 'Pay for the order straight away. Paying afterwards is not allowed.',
          action: 'See our services',
        },
        invoice: {
          title: 'Use our address as the delivery address',
          body:
            'At checkout, enter our warehouse as the delivery address, exactly as below. With your own name on it, we know whose parcel it is the moment it arrives. The address to copy is also in your account, under "Your shipping address".',
          note:
            'Please note: if a parcel arrives with a different address or name, we cannot tell that it is yours.',
        },
        announce: {
          title: 'Register the shipment with us',
          body:
            'Pre-alert the parcel in your account: the tracking number, the courier, the shop and what is inside. No declared value is needed. Add the shop\'s invoice and customs goes faster.',
          action: 'Pre-alert a parcel',
        },
        warehouse: {
          title: 'We receive and handle your parcel',
          body:
            'At our warehouse in Berkel en Rodenrijs we book your parcel in, measure and weigh it, and make it ready to ship. Separate parcels can be combined into one shipment. You see the weight, the size and photos of your parcel with the shipment in your account.',
        },
        track: {
          title: 'Follow your shipment',
          body:
            'Once your shipment is on its way, you follow every step with Track & Trace in your account.',
          action: 'Track your shipment',
        },
        delivery: {
          title: 'Delivery on the island',
          body:
            'At the destination your shipment is delivered or held ready for collection. You choose in your account, with the shipment: "Delivery" or "Pick it up myself". You choose only once; to change it afterwards, e-mail us. Each destination page explains exactly how it works.',
          action: 'See destinations',
        },
      },
    },
    // The blog (src/pages/Blog). The articles themselves are written by the
    // office in the dashboard; these are only the page's own words.
    blog: {
      title: 'Blog',
      lead: 'Tips and explanations about ordering in the Netherlands and shipping to the islands.',
      empty: 'There are no posts yet. Check back soon!',
      readMore: 'Read more',
      back: 'All posts',
      notFound: 'Post not found',
      notFoundText: 'This post does not exist (any more). Have a look at the other posts on the blog.',
      otherLanguage: 'This post has not been translated (yet) and is shown here in',
      languages: { nl: 'Dutch', en: 'English', pap: 'Papiamentu' },
      ctaTitle: 'Ready to order?',
      ctaQuote: 'Request a quote',
      ctaContact: 'Contact us',
    },
    footer: {
      tagline:
        'Shop smarter, save more. Compare prices and find the best deals in one place.',
      navigation: 'Navigation',
      company: 'Company',
      legal: 'Legal',
      about: 'About us',
      blog: 'Blog',
      faq: 'FAQ',
      privacy: 'Privacy policy',
      terms: 'Terms and conditions',
      social: 'Social media',
      footerNav: 'Footer navigation',
      rights: 'All rights reserved.',
      madeIn: 'Made in the Netherlands',
    },
  },

  // NOTE: the Papiamentu below needs review by a native speaker before launch.
  // See the spelling note at the bottom of this file.
  pap: {
    // The "Feedback" button on every page (components/Feedback).
    feedback: {
      button: 'Feedback',
      title: 'Kiko bo ta pensa di nos website?',
      intro: 'Duna nos un nota i bisa nos kiko por ta mihó. Nos ta lesa tur kos.',
      starsLabel: 'Bo evaluashon',
      star: '{count} di 5 strea',
      comment: 'Bo komentario (opshonal)',
      commentPlaceholder: 'Kiko a bai bon, kiko por ta mihó?',
      email: 'Bo adrès di e-mail (opshonal, si bo ke un kontesta)',
      send: 'Manda',
      sending: 'Ta manda…',
      cancel: 'Kanselá',
      close: 'Sera',
      chooseStars: 'Skohe 1 te 5 strea promé.',
      failed: 'No a logra manda. Purba atrobe.',
      thanks: 'Danki pa bo feedback!',
    },
    // "Factuur bekijken" on a shipment: the invoice and which products
    // reached the warehouse; see orderOverviewTranslations.js.
    orderOverview: orderOverviewTranslations.pap,
    // The office and warehouse dashboards; see dashboardTranslations.js.
    dashboard: {
      ...dashboardTranslations.pap,
      flow: warehouseFlowTranslations.pap,
      // The office's own pages; see dashboardPageTranslations.js.
      pages: dashboardPageTranslations.pap,
      // The invoice editor and its settings page; see invoiceTranslations.js.
      invoice: invoiceTranslations.pap,
    },
    nav: {
      home: 'Home',
      services: 'Servisionan',
      tutorial: 'Kon e ta funshoná',
      tracking: 'Track & Trace',
      booking: 'Boeking',
      calculator: 'Kalkulador',
      contact: 'Kontakto',
      label: 'Navegashon prinsipal',
    },
    destinations: {
      label: 'Destinashonnan',
      aruba: 'Aruba',
      bonaire: 'Boneiru',
      curacao: 'Kòrsou',
      dominicanRepublic: 'Repúblika Dominikana',
      saintMartin: 'Sint Maarten',
      suriname: 'Sürnam',
      other: 'Otro destinashonnan',
    },
    account: {
      login: 'Log in',
      signup: 'Registrá',
      logout: 'Sali',
      profile: 'Mi kuenta',
    },
    notFound: {
      title: 'Página no hañá',
      body: 'E página aki no ta eksistí, of el a move.',
      home: 'Bolbe na home',
    },
    menu: {
      open: 'Habri menu',
      close: 'Sera menu',
    },
    language: {
      label: 'Idioma',
      choose: 'Skohe un idioma',
    },
    // The shipping calculator (pages/Calculator). Prices: src/calculator/rates.js.
    calculator: {
      title: 'Kalkulá kosto di manda',
      summary:
        'Kalkulá un indikashon di kosto di manda pa Kòrsou: volúmen, peso kalkulá, fracht i derechi di importashon.',
      intro:
        'Tek kiko bo ta ordená i kon grandi i pisá e ta. Bo ta mira mesora e volúmen i e peso kalkulá, i - unda e tarifanan ta konosí - un indikashon di preis. Bo ke un preis eksakto? Pidi un preisnota ku e datonan aki ku un klek.',
      formTitle: 'Indikashon di preis',
      destination: 'Destinashon',
      price: 'Preis ku BTW den euro',
      vat: 'Tarifa di BTW',
      dimensions: 'Medidanan',
      sides: { lengthCm: 'Largura', widthCm: 'Hanchura', heightCm: 'Haltura' },
      weight: 'Peso',
      grams: 'gram',
      category: 'Kategoria di importashon',
      chooseCategory: 'Skohe un kategoria',
      // One label per category in src/calculator/rates.js (same keys, same order).
      categories: {
        clothing: 'Paña',
        shoes: 'Sapatu',
        bags: 'Saku, kofer i bolsa di plaka',
        fashionJewellery: 'Prenda di moda (no di oro ni plata)',
        preciousJewellery: 'Prenda di oro òf plata',
        watches: 'Oloshi',
        cosmetics: 'Make-up, kuido di kueru i kabei',
        perfume: 'Perfume i eau de toilette',
        computers: 'Laptop, kòmpiuter i tablet',
        phones: 'Telefòn selular',
        televisions: 'Televishon i pantaya di kòmpiuter',
        headphones: 'Headphone i earbuds',
        speakers: 'Boks di zonido i amplifikador',
        smallAppliances: 'Aparato elektriko chikí (kushina, sekadó di kabei, plancha, stofzuiger)',
        furniture: 'Mueble (mesa, kas, kama, kolchón)',
        seating: 'Stul i sofa',
        lighting: 'Lampi',
        homeTextiles: 'Shabana, paña di mesa i paña di kushina',
        kitchenware: 'Pan i artíkulo di kushina di staal',
        toys: 'Wega',
        gameConsoles: 'Konsola di wega',
        sports: 'Artíkulo di deporte',
        books: 'Buki i revista',
        other: 'Otro',
      },
      transport: 'Método di transporte',
      transports: { air: 'Fracht pa aire', sea: 'Fracht pa barku' },
      submit: 'Kalkulá',
      result: {
        title: 'Bo indikashon',
        empty: 'Yena e formulario i primi Kalkulá.',
        priceInclVat: 'Preis ku BTW',
        vat: 'BTW Hulandes ({percent}%)',
        goodsValue: 'Balor sin BTW Hulandes',
        volume: 'Volúmen',
        actual: 'Peso real',
        volumetric: 'Peso di volúmen',
        chargeable: 'Peso kalkulá (fracht pa aire)',
        freight: 'Fracht ({method})',
        fees: {
          administration: 'Kosto di atministrashon',
          documentation: 'Kosto di dokumentashon',
          handling: 'Kosto di handling',
        },
        duty: 'Derechi di importashon ({percent}%)',
        localTax: {
          curacao: 'Impuesto di benta (OB) {percent}%',
        },
        total: 'Total (indikashon)',
        notPriced:
          'Nos no ta kalkulá e preis pa e ruta aki outomátikamente ainda. Pidi un preisnota i nos ta manda bo e preis, ku e datonan aki riba yená kaba.',
        partial:
          'No tur kobransa pa e destinashon aki ta konosí ainda, p\'esei no tin total ainda. E sumanan aki riba ta loke ta konosí.',
        dutyNote:
          'E derechi di importashon ta sali for di e tarifa di derechi di importashon di Aduana Kòrsou. E porsentahe eksakto ta dependé di e kódigo di mercancía ku aduana ta skohe.',
        disclaimer:
          'Esaki ta un indikashon, no un preisnota. E suma final ta dependé di kiko nos ta midi i pesa ora e yega nos pakus, i di aduana riba e isla.',
      },
      quote: {
        button: 'Pidi un preisnota ku e datonan aki',
        intro: 'Indikashon di preis pidí via e kalkulador:',
      },
      errors: {
        priceInclVat: 'Tek un preis mas grandi ku 0.',
        lengthCm: 'Tek un largura mas grandi ku 0.',
        widthCm: 'Tek un hanchura mas grandi ku 0.',
        heightCm: 'Tek un haltura mas grandi ku 0.',
        weightGrams: 'Tek un peso mas grandi ku 0.',
        category: 'Skohe un kategoria.',
      },
    },
    // The authenticator-app step of signing in (pages/TwoFactor/TwoFactorPage.jsx).
    twoFactor: {
      codeTitle: 'Kódigo for di bo app',
      codeIntro: 'Habri bo app di autentikashon (p.e. Google òf Microsoft Authenticator) i tek e kódigo di seis sifra pa PayLesShopMore.',
      codeLabel: 'Kódigo',
      backupHint: 'Bo telefòn a perde? Tek un di bo kódigonan di rekuperashon.',
      verify: 'Konfirmá',
      checking: 'Ta kontrolá…',
      setupTitle: 'Protehá bo kuenta',
      setupIntro: 'Bo ta drenta ku bo kontraseña i un kódigo for di un app riba bo telefòn, asina ningun hende no por drenta ku djis bo kontraseña. Bo ta instalá esaki un biaha so.',
      step1: '1. Instalá un app di autentikashon i skan e kódigo QR aki.',
      qrLabel: 'Kódigo QR pa bo app di autentikashon',
      cannotScan: 'No por skan? Tek e yabi aki den e app:',
      step2: '2. Tek e kódigo ku e app ta mustra awor.',
      codeHint: 'Seis sifra. E kódigo ta kambia kada 30 sekònde.',
      finishSetup: 'Kaba di instalá',
      codesTitle: 'Warda bo kódigonan di rekuperashon',
      codesIntro: 'Bo telefòn a perde? Ku kada un di e kódigonan aki bo por drenta un biaha. Nan ta wòrdu mustrá un biaha so: download nan òf skirbi nan i warda nan na un lugá sigur.',
      download: 'Download kódigonan',
      codesFileTitle: 'PayLesShopMore kódigonan di rekuperashon (kada un ta traha un biaha)',
      savedThem: 'Mi a warda e kódigonan aki na un lugá sigur.',
      continue: 'Sigui',
      wrongCode: 'E kódigo ei no ta kòrekt. Kontrolá e ora riba bo telefòn i purba e kódigo di mas nobo.',
      locked: 'Muchu kódigo robes. Warda 15 minüt i purba atrobe.',
      offline: 'Esei no a sali bon. Kontrolá e konekshon i purba atrobe.',
      signOut: 'Sali',
    },
    // "Confirm it's you" before a sensitive admin action (components/ReauthDialog).
    reauth: {
      title: 'Konfirmá ku ta bo',
      intro: 'E akshon aki ta delikado. Tek bo kontraseña atrobe pa sigui.',
      password: 'Kontraseña',
      code: 'Kódigo for di bo app di autentikashon',
      confirm: 'Konfirmá',
      checking: 'Ta kontrolá…',
      cancel: 'Kanselá',
      wrongPassword: 'E kontraseña ei no ta kòrekt.',
      wrongCode: 'E kódigo ei no ta kòrekt. Purba e kódigo di mas nobo.',
      locked: 'Muchu purba. Purba atrobe despues.',
      failed: 'Esei no ta funshoná awor. Purba atrobe despues.',
    },
    login: {
      breadcrumb: 'Log in',
      title: 'Log in',
      subtitle: 'Log in den bo kuenta pa maneha bo enbionan.',
      email: 'Direkshon di e-mail',
      password: 'Kontraseña',
      showPassword: 'Mustra kontraseña',
      hidePassword: 'Skonde kontraseña',
      remember: 'Keda logiá',
      forgot: 'Lubidá bo kontraseña?',
      submit: 'Log in',
      submitting: 'Ta log in…',
      noAccount: 'Ainda no tin kuenta?',
      signupLink: 'Traha un',
      methodLabel: 'Kon bo ke log in?',
      methodPassword: 'Kontraseña',
      methodCode: 'Kódigo di warehouse',
      codeSubtitle:
        'Trahadó di warehouse? Yena bo direkshon di e-mail i e kódigo di kuater sifra ku un administrador a manda bo.',
      code: 'Kódigo',
      codeHint: 'Kuater sifra, for di e e-mail.',
      errors: {
        emailRequired: 'Yena bo direkshon di e-mail.',
        emailInvalid: 'E direkshon di e-mail aki no ta parse korekto.',
        passwordRequired: 'Yena bo kontraseña.',
        // Deliberately vague: naming which half was wrong tells an attacker
        // whether the address exists.
        failed: 'Direkshon di e-mail of kontraseña ta inkorekto.',
        offline: 'Log in no ta funshoná awor. Purba atrobe mas lat.',
        tooMany: 'Muchu purbamentu. Purba atrobe den un ora.',
        codeRequired: 'Yena e kódigo di kuater sifra.',
        codeInvalid: 'E kódigo ta presis kuater sifra.',
        // Deliberately vague, like `failed`: wrong, expired, used up and
        // not-a-warehouse-account all get this one sentence.
        codeFailed:
          'E kódigo aki no ta traha. Verifiká, òf pidi un administrador pa un nobo.',
      },
      // The "Who is working?" screen on a registered floor device, and the
      // page where a worker sets their PIN after an e-mailed code.
      floor: {
        title: 'Ken ta traha?',
        subtitle: 'Primi bo nòmber i tek bo pin.',
        device: 'Aparato: {name}',
        noWorkers: 'No tin trahadó di pakus riba e aparato aki ainda.',
        locked: 'Blokiá',
        noPin: 'Ainda sin pin',
        pinFor: 'Pin pa {name}',
        pin: 'Pin',
        pinHint: 'Kuater number.',
        notYou: '← No ta bo?',
        useCode: 'Drenta ku un kódigo manda pa e-mail',
        usePassword: 'Ofisina: drenta ku kontraseña',
        openList: 'Pakus? Primi bo nòmber →',
        noPinHelp:
          'Bo no tin pin ainda. Pidi un atministradó pa manda bo un kódigo pa e-mail, drenta kuné i despues skohe bo pin.',
        lockedHelp:
          'Bo pin ta blokiá despues di demasiado purba robes. Pidi un atministradó pa manda bo un kódigo pa e-mail i despues skohe un pin nobo.',
        errors: {
          failed: 'E pin ei no ta korekto.',
          coolingOff: 'Demasiado pin robes riba e aparato aki. Warda un par di minüt.',
        },
      },
      setPin: {
        title: 'Skohe bo pin',
        subtitle:
          'For di awor bo ta drenta asina riba e aparatonan kompartí den pakus: primi bo nòmber i tek kuater number.',
        pin: 'Pin nobo',
        repeat: 'Ripití e pin',
        hint: 'Kuater number. No 1234, 0000 òf algu asina, i no laga niun hende wak.',
        submit: 'Warda pin',
        saving: 'Wardando…',
        later: 'Despues',
        done: 'Bo pin ta wardá.',
        mustChange:
          'Bo a drenta ku un PIN di bo gerente. Skohe bo mes PIN awor - e pakus ta habri despues.',
        notAllowed:
          'Bo por pone bo pin solamente mesora despues di drenta ku un kódigo manda pa e-mail.',
        errors: {
          invalid: 'Un pin ta eksaktamente kuater number.',
          mismatch: 'E dos pinnan no ta mesun kos.',
          failed: 'No por a warda e pin. Purba atrobe.',
        },
      },
      notImplemented:
        'Log in ainda no ta konektá: no tin un server pa manda e datonan.',
    },
    // The warehouse's own sign-in page (pages/Warehouse/WarehouseLogin.jsx).
    warehouseLogin: {
      title: 'Drenta na pakus',
      subtitle: 'Drenta ku bo e-mail di trabou i bo PIN.',
      email: 'Adres di e-mail',
      pin: 'PIN',
      pinHint: 'Kuater number. No laga ningun hende wak.',
      submit: 'Drenta',
      forgotten: 'Bo a lubida bo PIN, òf e ta blokia? Puntra bo gerente pa un nobo.',
      office: 'Ofisina òf atministrashon?',
      officeLink: 'Drenta ku kontraseña',
      signedInAs: 'Bo ta drenta kaba komo {name}.',
      continueAs: 'Sigui pa pakus',
      switchToWorker: 'Drenta komo trahadó',
      errors: {
        failed: 'E adres di e-mail òf PIN no ta korekto.',
        tooMany: 'Muchu purba. Warda un ratu i purba atrobe.',
        email: 'Yena bo adres di e-mail.',
        pin: 'Un PIN ta eksaktamente kuater number.',
      },
    },
    signup: {
      breadcrumb: 'Registrá',
      title: 'Traha un kuenta',
      subtitle: 'Traha un kuenta pa sigui i maneha bo enbionan.',
      firstName: 'Nòmber',
      lastName: 'Fam',
      phone: 'Number di telefon',
      email: 'Direkshon di e-mail',
      password: 'Kontraseña',
      confirm: 'Konfirmá kontraseña',
      showPassword: 'Mustra kontraseña',
      hidePassword: 'Skonde kontraseña',
      passwordHint: 'Por lo ménos 12 karakter.',
      strength: {
        label: 'Fortalesa di kontraseña',
        weak: 'Débil',
        fair: 'Razonabel',
        good: 'Bon',
        strong: 'Fuerte',
      },
      terms: 'Mi ta di akuerdo ku e',
      termsLink: 'terminonan i kondishonnan',
      and: 'i e',
      privacyLink: 'polítika di privasidat',
      submit: 'Traha kuenta',
      submitting: 'Ta traha kuenta…',
      haveAccount: 'Bo tin un kuenta kaba?',
      loginLink: 'Log in',
      errors: {
        firstNameRequired: 'Yena bo nòmber.',
        lastNameRequired: 'Yena bo fam.',
        phoneRequired: 'Yena bo number di telefon.',
        phoneInvalid: 'E number di telefon aki no ta parse korekto.',
        emailRequired: 'Yena bo direkshon di e-mail.',
        emailInvalid: 'E direkshon di e-mail aki no ta parse korekto.',
        passwordRequired: 'Skohe un kontraseña.',
        passwordShort: 'Bo kontraseña mester tin por lo ménos 12 karakter.',
        confirmMismatch: 'E kontraseñanan no ta igual.',
        termsRequired: 'Bo mester aseptá e terminonan pa sigui.',
        taken: 'Ya tin un kuenta ku e direkshon di e-mail aki.',
        takenLogin: 'Log in ku e direkshon aki',
        passwordWeak:
          'E kontraseña aki ta muchu fásil pa adivná. Skohe un otro.',
        invalid: 'Chèk e datonan ku bo a yena i purba atrobe.',
        offline: 'Registrashon no ta funshoná awor. Purba atrobe mas lat.',
        tooMany: 'Muchu purbamentu. Purba atrobe den un ora.',
      },
      notImplemented:
        'Registrá ainda no ta konektá: no tin un server pa traha e kuenta.',
    },
    passwordReset: {
      requestTitle: 'Lubidá bo kontraseña',
      requestSubtitle:
        'Yena bo direkshon di e-mail. Si tin un kuenta ku e direkshon aki, nos ta manda bo un link pa skohe un kontraseña nobo.',
      email: 'Direkshon di e-mail',
      requestSubmit: 'Manda mi un link',
      requestSubmitting: 'Ta manda…',
      sentBody:
        'Si tin un kuenta ku e direkshon di e-mail aki, un link ta na kaminda.',
      sentNote:
        'E link ta bálido pa un ora. Chèk tambe bo map di spam.',
      backToLogin: 'Bèk na log in',
      chooseTitle: 'Skohe un kontraseña nobo',
      chooseSubtitle: 'Skohe un kontraseña nobo pa bo kuenta.',
      newPassword: 'Kontraseña nobo',
      confirm: 'Konfirmá kontraseña',
      chooseSubmit: 'Warda kontraseña',
      chooseSubmitting: 'Ta warda…',
      done: 'Bo kontraseña a kambia. Awor bo por log in.',
      deadTitle: 'E link aki no ta funshoná mas',
      deadBody:
        'E link aki a vense of a wòrdu usá kaba. Pidi un nobo pa sigui.',
      requestAnother: 'Pidi un link nobo',
      errors: {
        emailRequired: 'Yena bo direkshon di e-mail.',
        emailInvalid: 'E direkshon di e-mail aki no ta parse korekto.',
        passwordRequired: 'Skohe un kontraseña.',
        passwordShort: 'Bo kontraseña mester tin por lo ménos 12 karakter.',
        passwordWeak:
          'E kontraseña aki ta muchu fásil pa adivná. Skohe un otro.',
        confirmMismatch: 'E kontraseñanan no ta igual.',
        tooMany: 'Muchu petishon. Purba atrobe den un ora.',
        offline: 'Esaki no ta funshoná awor. Purba atrobe mas lat.',
      },
    },
    // Courier tracking: a webshop order on its way to our warehouse
    // (components/CourierTracking, backend/tracking/).
    courier: {
      openLink: "Sigui serka e kurier",
      title: "Sigui e kurier",
      unknownCarrier: "Kurier",
      lastLocation: "Último lugá konosí",
      expected: "Entrega spera",
      delivered: "Entregá riba",
      lastUpdated: "Último aktualisashon",
      notKnown: "Ainda no ta konosí",
      notYet: "Ainda no",
      history: "Aktualisashonnan",
      noEventsYet: "Ainda no tin aktualisashon di e kurier. Nan ta aparesé normalmente den algun ora despues ku e tienda manda bo òrdu.",
      manualOnly: "E kurier aki no ta wòrdu sigui outomátikamente. Nos tim ta agregá aktualisashon ora nos tin nan.",
      sourceCourier: "Kurier",
      sourceUs: "Nos tim",
      stageIncoming: "Na kaminda pa nos warehouse",
      stageOutgoing: "Na kaminda pa bo",
      copy: "Kopia",
      copied: "Kopiá",
      copyLabel: "Kopia e number di track",
      testData: "Datos di prueba",
      testDataNote: "Esaki ta datos di prueba inventá, no informashon real di e kurier.",
      carrierLabel: "Kompania di kurier",
      carrierPlaceholder: "Skohe e kurier",
      // The courier list's last choice (server code "other").
      otherCarrier: "Otro kurier",
      carrierHint: "Skohe e kurier pa sigui bo pakete riba su kaminda pa nos pakus.",
      problems: {
        delivery_failed: "E kurier no por a entregá e pakete aki na nos pakus. Wak e página di e kurier òf tuma kontakto ku e tienda.",
        delayed: "E kurier ta reportá atraso.",
        returned: "E kurier ta mand'e pakete aki bèk na e tienda. Por fabor tuma kontakto ku e tienda.",
        exception: "E kurier ta reportá un problema ku e pakete aki.",
      },
      status: {
        order_registered: "Òrdu registrá",
        awaiting_arrival: "Ta warda pa e pakete yega",
        received_at_warehouse: "Risibí na nos pakus",
        processing_at_warehouse: "Na prosesamentu na nos pakus",
        ready_for_shipment: "Kla pa manda",
        dispatched: "Mandá",
        in_transit: "Na kaminda",
        arrived_at_destination: "Yegá na pais di destinashon",
        customs: "Duana",
        out_for_delivery: "Ta bai entregá",
        delivered: "Entregá na nos pakus",
        delivery_failed: "Purba di entrega a faya",
        delayed: "Atrasá",
        returned: "Bèk na e remitente",
        exception: "Problema ku e entrega",
      },
    },
    // Pre-alerts: a parcel on its way to our warehouse (pages/PreAlert, Profile/PreAlerts.jsx).
    prealert: {
      newButton: "Pre-alerta un pakete",
      listTitle: "Riba kaminda pa nos pakus",
      loadFailed: "No por a karga bo pre-alertanan. Purba atrobe despues.",
      empty: "Ainda no tin pre-alerta. Bo a kumpra algu? Pre-alert'é pa nos rekonos'é ora e yega.",
      dialogTitle: "Pre-alerta",
      close: "Sera",
      statusLabel: "Estado",
      back: "Bèk",
      title: "Pre-alerta un pakete",
      intro: "Laga nos sa ku un pakete ta riba kaminda pa nos pakus, pa nos sa ku e ta di bo i prosesá e lo mas lihé posibel.",
      requiredNote: "Kamponan ku * ta obligatorio.",
      read: {
        title: "Mas lihé: yena e ku un screenshot",
        text: "Upload un screenshot òf PDF di e konfirmashon di òrdu òf e e-mail di embarke di e webshop. Nos ta yena e formulario pa bo; bo ta kontrolá e despues.",
        button: "Skohe screenshot",
        reading: "Lesando…",
        done: "Yená for di bo screenshot. Kontrolá tur kos promé ku bo manda.",
        nothing: "Nos no por a haña nada útil den e archivo aki. Por fabor yena e formulario bo mes.",
        failed: "E archivo no por a wòrdu lesá awor. Por fabor yena e formulario bo mes.",
      },
      trackingNumber: "Number di tracking",
      carrier: "Kompania di kurier",
      chooseCarrier: "Skohe e kurier",
      shop: "Tienda kaminda bo a kumpr'é",
      chooseShop: "Skohe e tienda",
      otherShop: "Otro tienda…",
      shopName: "Nòmber di e tienda",
      description: "Deskripshon di e pakete",
      descriptionPlaceholder: "Por ehèmpel: 1 motherboard i 1 power supply",
      consignee: "Risibidó",
      value: "Balor deklará",
      invoice: "Faktura",
      invoiceHint: "E faktura òf konfirmashon di òrdu di e tienda: PDF, JPG, PNG òf WebP, maksimo 10 MB pa kada, te {count} archivo. No ta obligatorio, pero e ta hasi duana mas lihé.",
      addFile: "Agregá un archivo",
      removeFile: "Kita",
      noInvoice: "Ningun faktura agregá.",
      restrictedBefore: "Mi ta konfirmá ku mi a lesa e",
      restrictedLink: "lista di artíkulonan ku nos no ta manda",
      restrictedAnd: "i e",
      termsLink: "kondishonnan general",
      send: "Manda pre-alerta",
      sending: "Ta manda…",
      leave: "Kanselá",
      savedTitle: "Pre-alerta registrá",
      savedText: "Danki. Bo pre-alerta {reference} a wòrdu registrá.",
      savedNext: "Nos ta sigui bo pakete i laga bo sa ora e yega nos pakus. Bo ta hañ'é bou di Mi enbionan.",
      toShipments: "Bai na Mi enbionan",
      another: "Pre-alerta un otro pakete",
      inShipment: "Den nos enbio",
      cancel: "Kanselá e pre-alerta aki",
      cancelConfirm: "Kanselá e pre-alerta aki? Nos lo no warda e pakete aki mas.",
      cancelled: "E pre-alerta a wòrdu kanselá.",
      status: {
        submitted: "Pre-alerta risibí",
        arrived: "Yegá na nos pakus",
        in_shipment: "Agregá na un enbio",
        cancelled: "Kanselá",
      },
      errors: {
        failed: "Esei no a bai bon. Kontrolá bo konekshon i purba atrobe.",
        trackingNumber: "Yena e number di tracking.",
        carrier: "Skohe e kompania di kurier.",
        shop: "Skohe e tienda, òf tek su nòmber.",
        description: "Deskribí kiko tin den e pakete.",
        consignee: "Yena ken ta risibí e pakete.",
        restricted: "Konfirmá ku bo a lesa e lista di artíkulonan ku nos no ta manda.",
        fileType: "{name}: solamente un PDF, JPG, PNG òf WebP por wòrdu agregá.",
        fileSize: "{name} ta mas grandi ku 10 MB.",
        fileCount: "Maksimo {count} archivo.",
      },
    },
    tracking: {
      notRegistered: "Nos no konosé e number aki ainda. Bo a hañ'é di e tienda òf kurier?",
      registerIt: "Registr'é akí i sigui e te den nos pakus.",
      title: 'Sigui bo enbio',
      // The whole order under the box on the profile page (TrackedOrder.jsx).
      details: {
        booked: "Reservá riba {date} · Reservashon {number}",
        loading: "Ta karga bo enbio…",
        failed: "No por a karga tur e detayenan. Bo por mira nan bou di Mi enbionan.",
        ordersTitle: "Bo òrdunan den e enbio aki",
        courierOrder: "Òrdu: {shop} – {description}",
        inShipment: "Parti di nos enbio {number}.",
        onwardTitle: "Asina bo enbio ta yega na bo",
      },
      subtitle: "Yena bo number di tracking, òf e number di e kurier, pa mira tur kos di bo òrdu.",
      label: 'Number di tracking',
      placeholder: "Por ehèmpel PLSM-1001 òf 3SABC1234567",
      submit: 'Sigui enbio',
      searching: 'Ta buska…',
      hint: "Nos number di tracking ta den bo e-mail di konfirmashon; esun di e kurier bo ta haña di e tienda.",
      number: 'Number di tracking',
      destination: 'Destinashon',
      shipped: 'Manda riba',
      delivered: 'Entregá riba',
      expected: 'Yegada stimá',
      progress: 'Progreso di e enbio',
      notKnown: 'Ainda no konosí',
      privacyNote:
        'Akinan bo ta mira e status i e destinashon. E detayenan kompleto di bo enbio ta bou di Mi enbionan.',
      locked: {
        title: 'Enbio ta na kaminda',
        body: 'E enbio aki a sali kaba i no por wòrdu kambiá mas. Kompranan nobo ta bai komo un enbio separá, ku su mes number di tracking.',
        delivered: 'E enbio aki a wòrdu entregá i no por wòrdu kambiá mas.',
        cancelled: 'E enbio aki a wòrdu kanselá i no por wòrdu kambiá mas.',
      },
      errors: {
        required: 'Yena un number di tracking.',
        notFound:
          'Nos no por a haña un enbio ku e number di tracking aki den bo kuenta. Chèk e number i purba atrobe.',
        tooMany: 'Muchu búskeda. Purba atrobe den un ora.',
        offline: 'Buskamentu no ta funshoná awor. Purba atrobe mas lat.',
      },
    },
    booking: {
      // Normal or guided form, and the guided form's steps (pages/Booking/Booking.jsx).
      mode: {
        title: "Kon bo ke yena e formulario?",
        normal: "Formulario normal",
        normalText: "Yena tur e detayenan riba un página.",
        guided: "Paso pa paso",
        guidedText: "Kompletá bo reservashon paso pa paso.",
      },
      steps: {
        label: "Pasonan di e reservashon",
        counter: "Paso {step} di {total}: {name}",
        shipment: "Enbio",
        sender: "Remitente",
        recipient: "Risibidó",
        consignment: "Òrdunan",
        options: "Opshonnan",
        review: "Kontrolá",
      },
      guided: {
        continue: "Sigui",
        back: "Bèk",
        edit: "Kambia",
        yes: "Si",
        no: "No",
        store: "Tienda",
        name: "Nòmber",
        optionsTitle: "Opshonnan ekstra",
        reviewTitle: "Kontrolá bo reservashon",
        reviewText: "Kontrolá tur kos aki bou. Ku Kambia bo ta adaptá un parti; loke bo a yena kaba ta keda wardá.",
        recipientHint: "E persona ku ta risibí e enbio riba e isla: nòmber, adrès i number di telefòn pa e entrega.",
      },
      title: 'Formulario di boeking',
      lead: 'Yena e formulario di boeking akinan en bes di riba papel. Nos ta agregá e number di shipping, e volúmen i e peso ora bo enbio yega serka nos.',
      nav: 'Boeking',
      sections: {
        shipment: 'Enbio',
        sender: 'Remitente',
        recipient: 'Ontvangedó',
        consignment: 'E enbio',
        emigration: 'Emigrashon',
        insurance: 'Seguro i remarke',
        terms: 'Kondishon i firma',
      },
      freightLabel: 'Tipo di fleta',
      freight: { sea: 'Fleta pa laman', air: 'Fleta pa aire' },
      destinationLabel: 'Destinashon',
      destinationOther: 'Otro',
      destinationOtherPlaceholder: 'Kua destinashon?',
      firstName: 'Nòmber',
      lastName: 'Fam',
      address: 'Adrès',
      postalCode: 'Kódigo postal',
      city: 'Lugá',
      phone: 'Number di telefon',
      email: 'Direkshon di e-mail',
      emailOptional: 'Direkshon di e-mail (opshonal)',
      cribOptional: 'Number di Crib (opshonal)',
      quantity: 'Kantidat',
      quantityHint:
        'Bo no sa ainda di kuantu pakete bo òrdu ta konsistí? Laga e kampo aki bashí: nos ta konta e paketenan ora nan yega serka nos.',
      unit: 'Tipo',
      units: { boxes: 'Kaha', pallets: 'Pallet', colli: 'Colli' },
      contents: 'Kontenido',
      contentsAttached: 'Mi ta manda e lista di paketehe separá',
      // "Uw bestellingen" on the booking form (src/pages/Booking/OrdersField.jsx).
      orders: {
        title: 'Bo òrdunan',
        hint: 'Pa kada tienda, skohe unda bo a hasi òrdu i kiko bo a kumpra einan. Un screenshot di bo òrdu ta yuda nos rekonosé tur kos lihé.',
        store: 'Tienda {number}',
        shop: 'Tienda',
        choose: 'Skohe un tienda…',
        other: 'Otro tienda',
        otherName: 'Nòmber di e tienda',
        description: 'Kiko bo a ordená?',
        descriptionPlaceholder: 'Por ehempel: laptop i mouse',
        screenshot: 'Screenshot di bo òrdu (opshonal)',
        addScreenshot: 'Agregá un screenshot',
        screenshotFor: 'Screenshot pa tienda {number}',
        removeScreenshot: 'Kita {name}',
        removeStore: 'Kita',
        add: 'Agregá otro tienda',
        product: 'Produkto {number}',
        removeProduct: 'Kita',
        removeProductNamed: 'Kita produkto {number}',
        addProduct: 'Agregá un otro produkto',
        url: 'Link di e produkto (opshonal)',
        urlPlaceholder: 'Pega e link direkto di bo produkto aki.',
        productScreenshot: 'Screenshot di e produkto aki (opshonal)',
        productScreenshotFor: 'Screenshot pa produkto {product} di tienda {number}',
        wrongType: 'No por agregá {name}: solamente PNG, JPG, WebP òf PDF.',
        tooBig: '{name} ta mas grandi ku 10 MB.',
        refused: 'No por a prosesá un tienda òf screenshot. Kontrolá bo òrdunan i purba atrobe.',
        errors: {
          shop: 'Skohe un tienda.',
          shopName: 'Yena e nòmber di e tienda.',
          description: 'Yena kiko bo a ordená.',
          url: 'Pega e link kompleto, kuminsando ku https://',
        },
      },
      value: 'Balor',
      valueHint:
        'Aduana ta usa e suma aki pa kalkulá derecho di importashon. Pone e balor real.',
      packingLabel: 'Paketehe',
      packing: { sender: 'Pa mi mes', company: 'Pa Pay Less Shop More' },
      paymentLabel: 'Pago',
      payment: { bank: 'Banko', cash: 'Kèsh' },
      vehicleLabel: 'Si ta un vehíkulo',
      vehicle: {
        na: 'No ta aplikabel',
        combustion: 'Gasolin/diesel',
        electric: 'Elektriko/hibrido',
      },
      emigration: 'E enbio aki ta parti di un emigrashon',
      id_present: 'ID presente',
      deregistered: 'Registrá afó',
      deregistration_present: 'Prueba di registrashon afó presente',
      insured: 'Mi ke sigurá e enbio aki',
      insuranceInfo: {
        button: 'Kon e seguro ta funshoná?',
        text: 'E premio ta 1,5% di e balor di e mercancia + kosto di embarke, ku un premio mínimo di €95,00. E riesgo propio ta 1% di e balor sigurá, ku un riesgo propio mínimo di €250,00 i un máksimo di €750,00.',
      },
      insuredValue: 'Balor sigurá',
      notes: 'Remarke',
      termsClause: {
        important: 'IMPORTANTE!',
        agreeBefore: 'E remitente ta di akuerdo ku e',
        termsLink: 'kondishonnan general',
        liability:
          '{company} no ta responsabel pa e kontenido i balor di e pakete(nan) i no por wòrdu tené responsabel pa esaki di ningun manera. Doana lo usa e balor deklará pa kalkulá e derechi di importashon. Bo mes ta responsabel pa e balor aki, i si doana no ta di akuerdo ku e balor deklará, nan lo revisá esaki. Transportá artíkulonan prohibí ta kastigabel pa lei.',
        insurance:
          'E remitente ta di akuerdo ku e mercancia no ta sigurá, ku eksepshon si un seguro separá ta wòrdu sera kontra pago. Glas i artíkulonan di palu prensá semper ta eksklui.',
      },
      agree: 'Mi ta di akuerdo ku e kondishonnan general ariba.',
      signature: 'Firma',
      signatureHint:
        'Skirbi bo nòmber kompleto. Huntu ku e kaha ariba, esaki ta konta komo bo firma.',
      submit: 'Manda boeking',
      sending: 'Ta manda…',
      officeNote:
        'Nos ta yena e number di shipping, e volúmen, e peso i e kontrol di paketehe ora bo enbio yega serka nos.',
      done: {
        title: 'Nos a risibí bo boeking',
        body: 'Nos ta tuma kontakto ku bo ora nos a registrá e enbio.',
        reference: 'Bo referensia:',
        home: 'Bèk na e página prinsipal',
        seeBookings: 'Mira mi boekingnan',
        signInTip: 'Konseho: e próksimo biaha, login promé. Asina bo ta haña bo boeking bèk den bo kuenta, bou di "Mi boekingnan".',
      },
      errors: {
        required: 'E kampo aki ta obligatorio.',
        email: 'E direkshon di e-mail aki no ta parse korekto.',
        phone: 'E number di telefon aki no ta parse korekto.',
        quantity: 'Pone un kantidat di por lo ménos 1, òf laga e kampo bashí.',
        value: 'Pone e balor di e enbio.',
        contents: 'Deskribí e kontenido, of marka ku e lista ta bin separá.',
        insuredValue: 'Pone e balor pa sigurá.',
        signature: 'Skirbi bo nòmber kompleto pa firma.',
        terms: 'Bo mester aseptá e kondishonnan pa sigui.',
        invalid: 'Chèk e datonan ku bo a yena.',
        tooMany: 'Muchu petishon mandá. Purba atrobe den un ora.',
        offline: 'Mandamentu no ta funshoná awor. Purba atrobe mas lat.',
      },
    },
    loading: {
      message: 'Ta karga…',
      slow: 'Esaki ta tuma mas tempu ku normal. Podisé bo koneksion ta lent.',
      failedTitle: 'No tin koneksion',
      failedBody:
        'Nos no por a karga e datonan. Kontrolá bo koneksion di internet i purba atrobe.',
      retry: 'Purba atrobe',
      retrying: 'Ta purba atrobe…',
    },
    profile: {
      title: 'Mi kuenta',
      subtitle: 'Maneha bo datonan, adres i preferensianan.',
      demoNotice:
        'Atenshon: e pantaya aki ta mustra dato di ehèmpel. Ainda no tin server konektá, pues kambionan no ta wòrdu warda.',
      memberSince: 'Kliente for di',
      goToWarehouse: 'Bai na pakus',
      // "What to do next" banner for customers (pages/Profile/NextSteps.jsx).
      nextSteps: {
        title: 'Kiko ta e siguiente paso?',
        intro: 'Asina bo ta manda bo paketenan via nos, den tres paso:',
        bookButton: 'Hasi un boeking',
        steps: {
          order: { title: 'Ordena na un webshop', text: 'Usa nos adres di pakus komo adres di faktura i di entrega.', link: 'Mira e adres' },
          book: { title: 'Hasi un boeking', text: 'Yena e formulario di boeking, pa nos sa kiko ta bini pa bo i unda e mester bai.' },
          follow: { title: 'Sigui bo envio', text: 'Ora bo paketenan yega, bo ta mira nan bou di Mi envionan.', link: 'Bai na mi envionan' },
        },
      },
      // A warehouse worker signed in with a password opening the warehouse.
      unlock: {
        title: 'Bai na pakus',
        intro: 'Tek bo direkshon di e-mail i bo pin pa habri e pakus.',
        email: 'Direkshon di e-mail',
        pin: 'Pin',
        submit: 'Habri e pakus',
        opening: 'Habriendo…',
        cancel: 'Kanselá',
        noPinHelp:
          'Bo no tin pin ainda. Pidi un atministradó un kódigo pa drenta, tek e aki bou i skohe bo pin.',
        lockedHelp:
          'Bo pin ta blokiá despues di demasiado purba robes. Pidi un atministradó un kódigo pa drenta, tek e aki bou i skohe un pin nobo.',
        setup: {
          code: 'Kódigo di e atministradó',
          pin: 'Pin nobo',
          repeat: 'Ripití e pin',
          hint: 'Kuater number. No 1234, 0000 òf algu asina.',
          submit: 'Warda pin i habri e pakus',
          errors: {
            code: 'E kódigo ta eksaktamente kuater number.',
            mismatch: 'E dos pinnan no ta mesun kos.',
            codeFailed: 'E kódigo ei no ta traha. Kontrolá e, òf pidi un atministradó un nobo.',
          },
        },
        errors: {
          email: 'Tek bo direkshon di e-mail.',
          pin: 'Un pin ta eksaktamente kuater number.',
          failed: 'E direkshon di e-mail òf e pin ei no ta korekto.',
          tooMany: 'Demasiado purba. Warda un ratu i purba atrobe.',
          offline: 'No por habri e pakus awor. Purba atrobe despues.',
        },
      },
      // The profile's "Two-factor sign-in" card (pages/Profile/TwoFactorCard.jsx).
      twoFactor: {
        preparingAdmin: "Verifikashon den dos paso ta pagá riba e sitio. Prepará esaki promé riba bo mes kuenta akí; despues bo por send'é riba e página di Seguridat.",
        preparedAdmin: "Bo kuenta ta kla. Awor bo por send verifikashon den dos paso riba e página di Seguridat.",
        intro: 'Despues di bo kontraseña, e sitio ta pidi un kódigo for di un app riba bo telefòn (p.e. Google òf Microsoft Authenticator), asina ningun hende no por drenta ku djis bo kontraseña.',
        on: 'Na',
        off: 'Pagá',
        required: 'obligatorio pa bo kuenta',
        codesLeft: '{count} kódigo di rekuperashon ta sobra',
        turnOn: 'Sende',
        newCodes: 'Kódigo di rekuperashon nobo',
        turnOff: 'Paga',
        password: 'Bo kontraseña',
        code: 'Kódigo for di bo app',
        turnOffConfirm: 'Paga verifikashon di dos paso',
        newCodesConfirm: 'Traha kódigo nobo',
        cancel: 'Kanselá',
        freshCodes: 'Bo kódigonan di rekuperashon nobo. Esnan bieu no ta traha mas. Warda nan sigur; nan ta wòrdu mustrá un biaha so.',
        savedThem: 'Mi a warda nan',
        turnedOff: 'Verifikashon di dos paso ta pagá. Bo a sali riba bo otro aparatonan.',
        wrongCode: 'E kódigo ei no ta kòrekt. Purba e kódigo di mas nobo for di bo app.',
        wrongPassword: 'E kontraseña ei no ta kòrekt.',
        locked: 'Muchu kódigo robes. Warda 15 minüt i purba atrobe.',
        failed: 'Esei no ta funshoná awor. Purba atrobe despues.',
      },
      // "Your shipping address" (pages/Profile/WarehouseAddressCard.jsx).
      warehouseAddress: {
        title: "Bo adrès di entrega na Hulanda",
        intro: "Bo ta kumpra den un webshop (bol.com, Amazon, Coolblue, IKEA …)? Laga manda bo òrdu na nos pakus. Nos ta risibí e pakete i mand'é pa bo.",
        reminderTitle: "Importante:",
        reminder: "usa e adrès aki komo adrès di entrega pa kada òrdu. Yen'é eksaktamente manera e ta aki bou. Si un pakete yega ku otro adrès òf otro nòmber, nos no por sa ku e ta di bo.",
        firstName: "Nòmber",
        lastName: "Fam",
        street: "Kaya i number",
        postcode: "Kódigo postal",
        city: "Stat",
        country: "Pais",
        firstNameFallback: "Bo nòmber",
        lastNameFallback: "Bo fam",
        nameHint: "Yen'é eksaktamente asina: bo mes nòmber na \"nòmber\" i \"Pay less Shop More\" na \"fam\". Na bo nòmber nos ta rekonosé bo pakete na pakus.",
        copy: "Kopia",
        copyAll: "Kopia henter e adrès",
        copiedAll: "Adrès kopiá!",
        copied: "Kopiá.",
        copyFailed: "Kopiamentu no a funshoná. Selektá e teksto i kopi'é bo mes.",
        afterTitle: "Despues di kumpra",
        after1: "Warda e konfirmashon di òrdu di e webshop.",
        after2: "Avisá e pakete promé, ku e track-and-trace i e kompania di kurier.",
        after2Link: "Avisá un pakete",
        after3: "Nos ta sigui bo pakete te ora e yega nos pakus i ta laga bo sa mesora ku e ta aden.",
      },
      sections: {
        details: 'Datonan personal',
        warehouseAddress: "Bo adrès di entrega",
        address: 'Adres di entrega',
        tracking: 'Track & Trace',
        shipments: 'Mi enbionan',
        bookings: 'Mi boekingnan',
        invoices: 'Mi fakturanan',
        password: 'Kambia kontraseña',
        twoFactor: 'Verifikashon di dos paso',
        notifications: 'Notifikashonnan',
        danger: 'Kita kuenta',
      },
      fields: {
        name: 'Nòmber kompletu',
        firstName: 'Nòmber',
        lastName: 'Fam',
        email: 'Direkshon di e-mail',
        phone: 'Number di telefon',
        street: 'Kaya i number',
        postalCode: 'Kódigo postal',
        city: 'Siudat',
        country: 'Pais of isla',
        currentPassword: 'Kontraseña aktual',
        newPassword: 'Kontraseña nobo',
        confirmPassword: 'Konfirmá kontraseña nobo',
      },
      // "Mijn boekingen" (src/pages/Profile/MyBookings.jsx). The field
      // labels in its pop-up come from booking.* above.
      bookings: {
        handling: 'Kosto di handling',
        products: { link: 'Link di produkto', copy: 'Kopiá link', copied: 'Kopiá', price: 'Preis', quantity: 'Kantidat', subtotal: 'Subtotal', total: 'Subtotal di tienda', noLink: 'No a duna link' },
        intro: 'E boekingnan ku bo a manda miéntras bo tabata login, e mas nobo ariba. Klek riba un boeking pa mira tur loke bo a yena. Ora nos konfirmá un boeking, bo ta haña e bou di Mi enbionan.',
        loading: 'Bo boekingnan ta kargando…',
        failed: 'No por a karga bo boekingnan.',
        empty: 'Bo no tin boeking ainda. Un boeking ku bo manda miéntras bo ta login ta aparesé akinan.',
        new: 'Boeking nobo',
        title: 'Boeking',
        reference: 'Referensia',
        placedOn: 'Mandá riba',
        close: 'Sera',
        officeHeading: 'Yená pa nos',
        shippingNumber: 'Number di shipping',
        noNumber: 'No tin number di shipping ainda',
        notMeasured: 'Nos ta yena e volúmen i e peso ora bo enbio yega serka nos.',
        // Once the office works on a booking it becomes a shipment, followed under "Mi enbionan".
        inShipments: 'Sigui e bou di Mi enbionan:',
        name: 'Nòmber',
        crib: 'Number di Crib',
        listAttached: 'Lista di paki mandá aparte',
        notInsured: 'No asegurá',
        yes: 'Sí',
        no: 'Nò',
        orders: 'Bo òrdunan',
        openFile: 'Habri:',
        documents: {
          intro: 'Bo por agregá dokumentonan manera e konfirmashon di òrdu, faktura òf track-and-trace pa kada tienda ora ku bo ke.',
          closed: 'E boeking aki a wòrdu mandá òf kanselá: no por kambia dokumentonan mas.',
          add: 'Agregá dokumento',
          kind: 'Sorto di dokumento',
          chooseKind: 'Skohe un sorto',
          kinds: {
            order_confirmation: 'Konfirmashon di òrdu',
            invoice: 'Faktura',
            order_number: 'Number di òrdu (di e tienda)',
            tracking: 'Track-and-trace',
            other: 'Otro',
            screenshot: 'Screenshot',
          },
          file: 'Archivo',
          hint: 'PDF, JPG, PNG òf WebP, máksimo 10 MB.',
          upload: 'Subi',
          trackingLabel: 'Kódigo òf link di track-and-trace',
          trackingPlaceholder: 'Por ehèmpel 3SABC1234567 òf https://…',
          trackingHint: 'Kopia e kódigo òf e link for di e e-mail di manda di e webshop.',
          orderNumberLabel: 'Number di òrdu di e tienda (opshonal)',
          orderNumberPlaceholder: 'Por ehèmpel 1234567890',
          orderNumberHint: 'E number di òrdu for di e e-mail di konfirmashon di e tienda. Bo por laga esaki bashí.',
          addFile: 'Agregá arkivo',
          replaceFile: 'Kambia arkivo',
          rowAdded: 'Agregá',
          rowMissing: 'Ainda no agregá',
          moreOptions: 'Track & trace, number di òrdu òf otro arkivo',
          done: 'Kla',
          save: 'Warda',
          saving: 'Wardando…',
          confirmRemoveTracking: 'Kita e track-and-trace?',
          uploading: 'Subiendo…',
          cancel: 'Kanselá',
          remove: 'Kita',
          confirmRemove: 'Kita e dokumento aki?',
          errors: {
            kind: 'Skohe ki sorto di dokumento esaki ta.',
            file: 'Skohe un archivo.',
            tracking: 'Tek e kódigo òf link di track-and-trace.',
            orderNumber: 'Yena e number di òrdu.',
            failed: 'No por a agregá e dokumento. Purba atrobe.',
            removeFailed: 'No por a kita e dokumento. Purba atrobe.',
          },
        },
        valuePending: 'No yená ainda: nos ta yena e balor segun bo screenshotnan.',
        signedBy: 'Firmá pa',
        changeNote: 'Algu no ta korekto, òf bo ke kambia algu? Tuma kontakto ku nos:',
        status: {
          new: 'Risibí',
          confirmed: 'Konfirmá',
          booked_in: 'Registrá',
          shipped: 'Mandá',
          cancelled: 'Kanselá',
        },
      },
      shipments: {
        intro:
          'Kada enbio ta pará su so aki, ku su mes number di tracking, pa bo por mira kua kosnan ta pertenesé na kua enbio. Si bo kumpra algu despues ku un enbio a sali, esei ta bai riba un enbio nobo.',
        loading: 'Ta karga bo enbionan…',
        failed: 'No por a karga bo enbionan.',
        empty: 'Ainda bo no tin enbio.',
        shipped: 'A sali',
        delivered: 'Entregá',
        registered: 'Anunsiá riba',
        notShippedYet: 'Ainda no a sali',
        // The one date on a closed shipment bar.
        // NOTE: needs review by a native speaker.
        // Month headings in a group; {month} is e.g. "oktober 2026".
        orderedIn: 'Ordená na {month}',
        // The "comes first" block at the top, and the badge on its bar.
        next: {
          label: 'Ta yega promé',
          // Under the title; {date} is e.g. "8 oktober".
          expected: 'Ta warda {date}',
          // The countdown: "den" / 3 / "dia", or one word.
          before: 'den',
          unit: 'dia',
          today: 'Awe',
          tomorrow: 'Mañan',
          badge: 'Siguiente',
        },
        bar: {
          expected: 'Ta warda',
          delivered: 'Entregá',
          shipped: 'Mandá',
          registered: 'Anunsiá',
        },
        // What opens under a shipment (ShipmentDetails.jsx). {date}, {days}
        // and {island} are filled in by the page.
        // Delivery or pickup, in a shipment's pop-up (ShipmentDetails.jsx).
        handover: {
          title: 'Kon bo ke risibí e?',
          delivery: 'Entregá',
          pickup: 'Mi ta bin buska e',
          deliveryNote: 'Nos agente lo tuma kontakto ku bo pa entregá e.',
          pickupNote: 'Bo ta bin buska e bo mes. Nos ta laga bo sa ora e ta kla.',
          finished: 'E enbio aki a kaba.',
          failed: 'Nos no por a warda bo skohe. Purba atrobe.',
          chooseOnce: "Bo por skohe un biaha so. Despues bo por kambi'é solamente pa e-mail.",
          confirm: "Bo ta sigur? Bo ta skohe '{choice}'. Despues di esaki bo por kambi'é solamente pa e-mail.",
          changeByMail: 'Bo ke kambi esaki? Manda un e-mail na',
          mailSubject: 'Kambio di manera di risibí pa enbio',
        },
        details: {
          order: 'Enbio',
          photos: 'Potrèt di bo pakete',
          photo: 'Potrèt {number}',
          openPhoto: 'Habri:',
          // The photo viewer (components/PhotoGallery).
          gallery: {
            label: 'Ta mira {name}',
            close: 'Sera',
            download: 'Download',
            previous: 'Potrèt anterior',
            next: 'Siguiente potrèt',
            takenOn: 'saká riba {date}',
          },
          measured: 'Midí den depósito',
          close: 'Sera',
          howLong: 'Kuantu tempu e ta tuma ainda?',
          howLongWas: 'Kuantu tempu e a tuma?',
          arrivalOn: 'Yegada esperá: {date}',
          daysLeft: 'Mas o ménos {days} dia mas.',
          tomorrow: 'Ta warda e mañan.',
          today: 'Ta warda e awe.',
          late: 'E ta tuma un tiki mas largu ku esperá. Nos ta laga bo sa apenas bo enbio yega.',
          deliveredOn: 'Entregá riba {date}',
          took: 'E biahe a tuma {days} dia.',
          notShipped: 'Ainda no a manda',
          arrived: 'A yega riba e isla',
          arrivedNext: 'Nos agente ta tuma kontakto ku bo pa kordá e entrega.',
          typical: 'Komo indikashon: pa laman un enbio pa {island} ta nabegá mas o ménos {days} dia; despues e trámite di aduana ta tuma mas o ménos un siman i mei.',
          journey: 'Unda bo enbio ta?',
          progress: 'Progreso di e enbio',
          destination: 'Destinashon',
          registered: 'Anunsiá',
          shipped: 'Mandá',
          delivered: 'Entregá',
          weight: 'Peso',
          value: 'Balor',
          unknown: 'Ainda no ta konosí',
          notYet: 'Ainda no',
          invoice: 'Faktura',
          noInvoice: 'Ainda no tin faktura pa e enbio aki.',
        },
        // The steps of the journey timeline, by the server's stage code.
        stages: {
          received: 'Risibí na nos warehouse',
          ready_for_shipping: 'Kla pa manda',
          in_transit: 'Na kaminda',
          arrived: 'A yega na destinashon',
          delivered: 'Entregá',
          // The last step when the customer collects it (handover: pickup).
          picked_up: 'Bo a bin buska e',
        },
        // The three headings the list is split under (Shipments.jsx).
        groups: {
          toSend: 'Ainda pa manda',
          onTheWay: 'Na kaminda',
          received: 'Risibí',
          cancelled: 'Kanselá',
        },
        // The status label on each shipment, by the server's status code.
        status: {
          quoted: 'Preisnota mandá',
          paid: 'Pagá',
          purchased: 'Produktonan kumprá',
          ready_for_shipping: 'Kla pa manda',
          in_transit: 'Na kaminda',
          arrived: 'A yega na destinashon',
          delivered: 'Entregá',
          // A delivered shipment the customer collected themselves.
          picked_up: 'Bo a bin buska e',
          cancelled: 'Kanselá',
        },
        locked: {
          title: 'Enbio ta na kaminda',
          titleDelivered: 'Enbio entregá',
          titleCancelled: 'Enbio kanselá',
          body: 'E enbio aki a sali kaba i no por wòrdu kambiá mas. Kompranan nobo ta bai komo un enbio separá, ku su mes number di tracking.',
          delivered: 'E enbio aki a wòrdu entregá i no por wòrdu kambiá mas.',
          cancelled: 'E enbio aki a wòrdu kanselá i no por wòrdu kambiá mas.',
        },
      },
      invoices: {
        intro:
          'Nos ta traha un faktura pa kada enbio pagá. Ora e ta mandá, e ta pará akinan komo pdf.',
        loading: 'Ta karga bo fakturanan…',
        empty: 'Ainda bo no tin faktura. Nan ta aparesé akinan ora un enbio ta pagá i prosesá.',
        failed: 'No por a karga bo fakturanan.',
        retry: 'Purba atrobe',
        tracking: 'Enbio',
        download: 'Baha pdf',
      },
      notifications: {
        shipping: 'Notisia tokante mi enbionan',
      },
      dangerText:
        'Kita bo kuenta ta permanente. Tur bo dato i historia di enbio lo bai pèrdí.',
      deleteAccount: 'Kita kuenta',
      deleteConfirm: 'Bo ta sigur? Esaki no por wòrdu deshasí.',
      deletePasswordLabel: 'Konfirmá ku bo kontraseña',
      deleteAnonymised:
        'Bo datonan personal a wòrdu kitá. Bo registronan di enbio ta keda pasobra lei ta obligá nos guarda nan.',
      deleteDone: 'Bo kuenta a wòrdu kitá.',
      deleteCancel: 'Kanselá',
      deleteYes: 'Sí, kita mi kuenta',
      save: 'Warda',
      saving: 'Ta warda…',
      saved: 'Bo kambionan a wòrdu wardá.',
      errors: {
        nameRequired: 'Yena bo nòmber.',
        firstNameRequired: 'Yena bo nòmber.',
        lastNameRequired: 'Yena bo fam.',
        emailRequired: 'Yena bo direkshon di e-mail.',
        emailInvalid: 'E direkshon di e-mail aki no ta parse korekto.',
        currentRequired: 'Yena bo kontraseña aktual.',
        passwordShort: 'Bo kontraseña nobo mester tin por lo ménos 12 karakter.',
        confirmMismatch: 'E kontraseñanan no ta igual.',
        offline: 'Warda no ta funshoná awor. Purba atrobe mas lat.',
      },
      notImplemented:
        'Warda ainda no ta konektá: no tin un server pa manda e kambionan.',
    },
    destination: {
      // The "Otro destinashonnan" page: everywhere we ship that has no page
      // of its own. See pages/Destinations/OtherDestinations.jsx.
      otherTitle: 'Otro destinashonnan',
      otherLead:
        'Nos ta manda tambe pa e paisnan aki bou. E destinashonnan aki no tin nan mes página, pero nos ta reglar bo envio pa ayá mesíå bon — puntra nos tokante e posibilidatnan i e kosto.',
      otherCta: 'Puntra tokante e destinashon aki',
      eyebrow: 'For di òrdu te na porta',
      step: 'Paso',
      howTitle: 'Kon bo òrdu ta yega {island}',
      howSubtitle:
        'Bo mes ta kumpra, nos ta sòru pa e enbio. Dos paso ta di bo, dos ta di nos.',
      indexTitle: 'Nos destinashonnan',
      indexSubtitle:
        'Nos ta nabegá pa sinku destinashon. Skohe un pa mira kuantu tempu e biahe ta tuma i kiko bo por spera.',
      indexTransit: 'Biahe',
      indexArrives: 'Ta yega na',
      indexDays: '{days} dia',
      indexMore: 'Mira e destinashon aki',
      who: {
        you: 'Bo ta hasi esaki',
        us: 'Nos ta hasi esaki',
      },
      facts: {
        transit: 'Biahe',
        transitValue: 'mas o ménos {days} dia',
        arrives: 'Ta yega na',
        vat: 'Preisnan',
        vatValue: 'Sin BTW hulandes',
        handover: 'Entrega',
        handoverValue: 'Nos agente ta yama bo',
      },
      stages: {
        quote: {
          title: 'Pidi un preisnota',
          body: 'Konta nos kiko bo ke manda. Nos ta manda bo un preisnota indikativo pa e enbio pa {island}.',
        },
        purchase: {
          title: 'Bo mes ta kumpra',
          body: 'Bo mes ta hasi e òrdu i paga pa bo kompranan, i laga entregá nan na nos adrès di warehouse na Hulanda. Despues registrá e enbio serka nos ku e formulario di boeking.',
        },
        ship: {
          title: 'Nos ta manda',
          body: 'Nos ta risibí bo paketenan, midi i pisa nan, i manda nan pa {island} pa fleta pa laman òf fleta pa aire.',
        },
        deliver: {
          title: 'Nos ta desaduaná i entregá',
          body: 'Nos ta hasi e trámite di aduana na {island}. Asina bo enbio ta kla, nos agente ta tuma kontakto ku bo pa e entrega.',
        },
      },
      faq: {
        title: 'Pregunta tokante enbio pa {island}',
        more: 'Bo pregunta no ta aki?',
        contact: 'Puntra nos',
        what: {
          q: 'Kiko mi por manda?',
          a: 'Kasi tur kos: paña, elektrónika, aparato, hèrmènt i mueble. Kos peligroso, kuminda fresku i bateria lòs ta e eksepshonnan.',
        },
        cost: {
          q: 'Di kiko e preis ta dependé?',
          a: 'Di e peso i e volúmen di bo enbio, i di kon e ta biaha: pa laman òf pa aire. Nos preisnota ta semper indikativo; e suma final ta dependé di loke nos ta midi i pisa ora e yega den nos warehouse.',
        },
        time: {
          q: 'Kuantu tempu e ta tuma?',
          a: 'Pa fleta pa laman e biahe pa {port} ta tuma mas o ménos {days} dia; despues e trámite di aduana ta tuma mas o ménos un siman i mei. Pa fleta pa aire e ta bai mas lihé: entregá e lo mas tardá djaweps 12:00, e ta bula den fin di siman i e trámite di aduana ta tuma mas o ménos 3–4 dia.',
        },
        customs: {
          q: 'Mi mester regla algu ku aduana?',
          a: 'Nò. Nos ta prepará e papelnan i ta hasi e trámite di aduana. Derecho di importashon na destinashon ta separá; bo preisnota ta duna un indikashon di nan.',
        },
        oversize: {
          q: 'I kos di tamaño grandi?',
          a: 'Nan por biaha. Nos ta wak kaso pa kaso kiko ta e mihó manera pa manda nan. Pone e mèdintan den bo petishon.',
        },
      },
      quote: {
        title: 'Pidi un preisnota',
        intro:
          'Konta nos kiko bo ke manda i nos ta kalkulá kiko e ta kosta pa manda esaki pa bo. Nos preisnotanan ta semper indikativo.',
        forIsland: 'Preisnota pa',
        optional: '(opshonal)',
        orDrop: 'of lag\'e kai akinan',
        filesNote:
          'Un dokumento pa petishon. Bo tin mas, of ningun? Deskribí esaki den e kaha di mensahe abou, of manda e restu pa',
        requiredNote: 'Kampo ku * ta obligatorio.',
        firstName: 'Nòmber',
        lastName: 'Fam',
        email: 'Direkshon di e-mail',
        // The upload is meant for the webshop invoice of what is being sent.
        upload: 'Bo faktura',
        // The "Kon e formulario aki ta funshoná?" pop-up above the form
        // (HelpDialog). Each line of `steps` becomes one numbered step.
        // NOTE: needs review by a native speaker.
        help: {
          open: 'Kon e formulario aki ta funshoná?',
          title: 'Kon pa pidi un preisnota',
          steps: [
            'Yena bo nòmber, fam i direkshon di e-mail. Nos ta manda e preisnota pa e direkshon di e-mail ei.',
            'Upload e faktura di bo kompra na "Bo faktura": klek riba "Skohe un dokumento" of lag e dokumento kai den e kaha. Un PDF, potrèt of screenshot (JPG of PNG) te ku 10 MB ta bon.',
            'Ainda no tin faktura, of bo tin mas ku un? Deskribí den e kaha di mensahe kiko bo ke manda, of manda e otro fakturanan pa info@paylesshopmore.com.',
            'Klek riba "Manda petishon". Lo bo risibí un preisnota indikativo pa e-mail mas lihé posibel.',
          ],
          done: 'Mi a komprondé',
          close: 'Sera',
        },
        uploadHint: 'PDF, JPG of PNG, te ku 10 MB.',
        chooseFile: 'Skohe un dokumento',
        noFile: 'No a skohe dokumento',
        removeFile: 'Kita dokumento',
        message: 'Bo mensahe',
        messagePlaceholder:
          'Deskribí kiko bo ke manda, of bisa nos kiko nos mester sa.',
        send: 'Manda petishon',
        sending: 'Ta manda…',
        errors: {
          firstNameRequired: 'Yena bo nòmber.',
          lastNameRequired: 'Yena bo fam.',
          emailRequired: 'Yena bo direkshon di e-mail.',
          emailInvalid: 'E direkshon di e-mail aki no ta parse korekto.',
          fileTooLarge: 'E dokumento aki ta mas grandi ku 10 MB.',
          fileType: 'Skohe un dokumento PDF, JPG of PNG.',
          invalid: 'Kontrolá e datonan ku bo a yena.',
          tooMany: 'Muchu petishon mandá. Purba atrobe den un ora.',
        },
        sent: 'Danki! Bo petishon a wòrdu mandá — bo ta risibí un preisnota indikativo mas pronto posibel.',
        notImplemented:
          'E formulario di preisnota ainda no ta konektá: no tin un server pa manda e petishon.',
      },
    },
    home: {
      hero: {
        eyebrow: 'Sin BTW for di Hulanda pa Aruba, Boneiru i Kòrsou',
        title: 'Kumpra na Hulanda. Nos ta entregá e sin BTW na e isla.',
        lead: 'Kumpra na kualke webshop hulandes i laga nan manda e pa nos warehouse na Hulanda. Bo órdennan, reglá fásil. Nos ta hunta i manda nan sin BTW pa barku òf avion, i despues entregá nan na bo kas na Aruba, Boneiru òf Kòrsou.',
        trackCta: 'Sigui un enbio',
        startCta: 'Kuminsá',
        howCta: 'Kon e ta funshoná',
        myShipments: 'Mi enbionan',
        points: {
          shop: {
            title: 'Bo ta kumpra',
            body: 'Na kualke webshop hulandes, ku nos adrès komo adrès di entrega.',
          },
          ship: {
            title: 'Nos ta manda',
            body: 'Nos ta hunta bo pakètnan i manda nan sin BTW pa fleit di laman òf fleit di aire.',
          },
          deliver: {
            title: 'Bo ta risibí',
            body: 'Nos agente na e isla ta sòru pa bo òrdu yega fásil na bo kas òf na bo trabou.',
          },
        },
      },
      shops: {
        title: 'HASI BO ÒRDU NA BO TIENDANAN FAVORITO',
        visit: 'Mira tienda',
        cta: 'Mira tur tienda',
      },
      stats: {
        title: 'Nos siframan',
        loading: 'Ta karga sifranan…',
        delivered: 'Pakete entregá',
        destinations: 'Destinashon servi',
        customers: 'Kliente',
        tracking: 'Sigui enbio',
      },
      map: {
        eyebrow: 'Nos rutanan',
        title: 'For di Hulanda pa e islanan',
        lead: 'Pasa riba un destinashon pa mira e ruta i kuantu tempu e ta tuma.',
        origin: 'Hulanda',
        hint: 'Skohe un destinashon riba e mapa pa mira e ruta.',
        sea: 'Fleta pa laman',
        seaDays: '{days} dia riba laman',
        seaClearance: 'Trámite di aduana mas o ménos un siman i mei',
        air: 'Fleta pa aire',
        flights: {
          thursdayWeekend: 'Entregá lo mas tardá djaweps 12:00 — ta bula den fin di siman',
          mondayThursday: 'Entregá djaluna òf djaweps promé ku 12:00',
        },
        airClearance: 'Tránsito i trámite di aduana mas o ménos 3–4 dia',
        more: 'Mira e destinashon aki',
      },
      services: {
        eyebrow: 'Kiko nos ta hasi',
        title: 'Tur loke bo enbio tin mester',
        lead: 'For di bestel na un webshop te na entrega riba e isla.',
        learnMore: 'Lesa mas',
        shopAndShip: {
          title: 'Shop & ship',
          body: 'Bestel na webshopnan hulandes i laga entregá na nos adrès. Nos ta hasi e resto.',
        },
        consolidation: {
          title: 'Konsolidashon',
          body: 'Nos ta kombiná vários òrdu den un solo enbio, pa bo paga kustu di enbio un biaha so.',
        },
        doorToDoor: {
          title: 'Di porta pa porta',
          body: 'Nos agente na destinashon ta tuma kontakto i ta regla entrega na bo kas.',
        },
        customs: {
          title: 'Aduana i papelnan',
          body: 'Nos ta prepará e dokumentonan i ta hasi e trámite di aduana, pa bo enbio no keda pará.',
        },
        tracking: {
          title: 'Track & trace',
          body: 'Sigui bo enbionan den bo kuenta, for di salida te na entrega.',
        },
        business: {
          title: 'Enbio komersial',
          body: 'Bo ta manda regularmente pa e islanan? Tuma kontakto pa areglonan na midí.',
        },
      },
      journey: {
        eyebrow: 'For di òrdu te na porta',
        title: 'Kiko ta pasa ku bo enbio',
        lead: 'Tur enbio ta pasa dor di e mesun etapanan, i den bo kuenta semper bo por mira na kua e ta.',
        stages: {
          ordered: 'Ordená',
          collected: 'Entregá/Hunta',
          inTransit: 'Na kaminda',
          arrived: 'A yega na destinashon',
          ready: 'Kla',
        },
      },
      cta2: {
        title: 'Kla pa bo siguiente enbio?',
        lead: 'Maneha bo logístika i sigui bo enbionan for di un solo lugá.',
        start: 'Kuminsá manda',
        track: 'Sigui enbio',
      },
      cta: {
        titleAccent: 'ORDENÁ DIREKTAMENTE',
        title: 'I SIGUR',
        body: 'Nos ta manda bo produktonan faborito i kosnan di kompanianan hulandes liber di BTW pa Kòrsou of Boneiru. Asina bo no tin mester di molestiá amigu i famia mas. Tuma kontakto ku nos pa mas informashon tokante nos servisionan of ku kualke pregunta.',
        button: 'KONTAKTÁ NOS',
        videoLabel: 'Pone e video',
        videoSlot: 'Video — agregá e poster i e embed',
      },
      steps: {
        title: 'Kon pa hasi bo òrdu',
        account: 'Traha un kuenta',
        shop: 'Kumpra i paga ménos',
        payment: 'Yena e detayenan di pago korekto',
        documents: 'Manda bo dokumentonan',
        pickup: 'Buska bo òrdunan',
      },
      shopAndShip: {
        title: 'Shop and ship pa Aruba, Boneiru i Kòrsou',
        readMore: 'Lesa mas',
        readMoreAbout: 'tokante',
        particulier: {
          title: 'Partikular',
          body: 'Nos ta einan pa bo ora bo ke muda pa eksterior. Un mudansa internashonal ta pidi hopi tempu i energia. Nos tin hopi eksperensia ku esaki i ta yuda bo sali bon prepará. Serka nos ta posibel pa transportá bo kosnan di kas pa kas.',
        },
        zakelijk: {
          title: 'Komersial',
          body: 'Nos ta sirbi tur empresa, chikí i grandi, ku tur tipo di transporte. Sea ta un karga di palet, un solo pakete, material mas grandi, kontenedor of karga na granel, bo ta na e lugá korekto. Nos meta ta komprendé bo deseonan mas bon posibel pa nos por ehekutá nan ku e mayor kuidou.',
        },
        payless: {
          title: 'Pay Less Shop More',
          body: 'Bo ke risibí produktonan hulandes sin mester enbolbí bo amigunan i famia na Hulanda? Nos ta manda i despachá tur produkto liber di BTW pa bo kas of bo empresa na Boneiru of Kòrsou.',
        },
      },
    },
    services: {
      hero: {
        title: 'Nos servisionan',
        lead: 'Deskubrí nos servisionan pa Aruba, Boneiru i Kòrsou.',
      },
      islandsLabel: 'Nos islanan',
      companies: {
        title: 'Tiendanan',
        lead: 'E tiendanan kaminda nos klientenan ta kumpra mas tantu.',
        placeholder: 'Nòmber',
        cta: 'Mira tienda',
      },
      offer: {
        title: 'Kiko nos ta hasi pa bo',
        lead: 'For di nos warehouse na Hulanda te na entrega riba e isla.',
        sea: {
          title: 'Fleta pa laman',
          body: 'Pa enbionan grandi, pisá òf voluminoso. E biahe ta tuma {min} te {max} dia, dependiendo di e isla.',
        },
        air: {
          title: 'Fleta pa aire',
          body: 'Bo tin prisa? Pa aire bo enbio ta yega mas lihé na e isla: entregá e lo mas tardá djaweps 12:00 i e ta bula den fin di siman.',
        },
        warehouse: {
          title: 'Risibí i hunta',
          body: 'Nos ta risibí bo paketenan den nos warehouse na Hulanda, midi i pisa nan, i hunta nan den un solo enbio.',
        },
        customs: {
          title: 'Aduana i papelnan',
          body: 'Nos ta prepará e papelnan i ta hasi e trámite di aduana riba e isla: mas o ménos un siman i mei pa fleta pa laman, mas o ménos 3–4 dia pa fleta pa aire.',
        },
        delivery: {
          title: 'Entrega riba e isla',
          body: 'Asina bo enbio ta kla, nos agente ta tuma kontakto ku bo pa regla e entrega.',
        },
        moving: {
          title: 'Muda i komersial',
          body: 'Bo ta emigrá, òf bo ta manda pa bo negoshi? Nos ta manda tambe kosnan di kas, palet i kolinan mas grandi. Puntra nos tokante e posibilidatnan.',
        },
      },
      contactCta: {
        title: 'Kurioso kiko nos por hasi pa bo?',
        button: 'Tuma kontakto ku nos',
      },
      eyebrow: 'NOS',
      title: 'SERVISIONAN',
      breadcrumb: 'Servisionan',
      sectionTitle: 'Nos servisionan',
      forIsland: 'Nos servisionan pa',
      lead: 'For di bo òrdu na un webshop hulandes te na entrega na bo kas riba e isla.',
      islandsTitle: 'Unda nos ta manda',
      islandsLead: 'Skohe bo destinashon pa mira kon e ta funshoná i pidi un preis.',
      viewDestination: 'Mira destinashon',
      shopsTitle: 'Tienda kaminda nos klientenan ta bestel',
      shopsLead: 'Bo por bestel na kasi tur webshop hulandes. Esakinan ta esnan ku nos ta mira mas tantu.',
      ctaTitle: 'Tin pregunta tokante nos servisionan?',
      ctaBody: 'Konta nos kiko bo ke manda i nos ta manda bo un preis.',
      ctaPrimary: 'Tuma kontakto',
      ctaSecondary: 'Mira destinashonnan',
      highlights: {
        vat: 'Eksenshon di BTW',
        products: 'Produktonan úniko',
        transport: 'Transporte kompletu',
      },
      actions: {
        book: 'Registrá un envío',
        destinations: 'Mira destinashonnan',
        faq: 'Lesa e preguntanan frekuente',
        track: 'Sigui bo envío',
        contact: 'Tuma kontakto',
      },
      shopsFooter:
        'Bo tienda no ta den e lista? No ta problema — bo por bestel na kasi tur webshop hulandes i manda e pakete na nos depósito.',
      shops: {
        general: {
          title: 'Oferta general',
          note: 'Tiendanan grandi kaminda bo por haña kasi tur kos den un solo òrdu.',
        },
        electronics: {
          title: 'Elektróniko',
          note: 'Tene kuenta ku e voltahe i e steker: riba e islanan esaki no ta semper meskos ku na Hulanda.',
        },
        fashion: {
          title: 'Moda i kas',
          note: 'Paña i mueble. Mueble grandi ta konta pa volúmen — pidi un preis promé.',
        },
        beauty: {
          title: 'Beauty i drogisterij',
          note: 'Likido i spùit tin restrikshon den fleit di airu; pa laman tin mas posibilidat.',
        },
        kids: {
          title: 'Mucha i huguete',
          note: 'Hugete i artíkulo pa bebi. Hugete ku baterij nos ta deklará apart.',
        },
        specialist: {
          title: 'Espesialisá',
          note: 'Pieza di outo, buki i artíkulo di ofisina. Pieza ku zeta òf baterij mester di papel extra.',
        },
      },
      rates: {
        title: 'Kuantu e ta kosta?',
        lead: 'Nos tarifanan ta kuminsá na e montantenan aki bou. Loke bo ta paga na final ta dependé di e volúmen, e peso i e destinashon di bo envío.',
        from: 'for di',
        popular: 'Mas skohé',
        factorsTitle: 'Kiko ta determiná e preis?',
        note: 'E montantenan aki riba ta indikativo i ta sirbi komo punto di salida. Nos ta midi i pisa bo envío den depósito; e preis ku bo ta risibí despues ta esun ku ta konta.',
        cta: 'Pidi un preis',
        tiers: {
          parcel: {
            name: 'Pakete',
            size: 'Te mas o ménos 30 × 30 × 30 cm',
            body: 'Un solo òrdu di webshop: paña, buki, elektróniko chikitu òf pieza.',
          },
          box: {
            name: 'Doos',
            size: 'Te mas o ménos 60 × 40 × 40 cm',
            body: 'Vários òrdu ku nos ta uni pa bo den un solo envío.',
          },
          pallet: {
            name: 'Pallet',
            size: 'For di mas o ménos 120 × 80 cm',
            body: 'Kos di mudansa, mueble òf stòk komersial.',
          },
        },
        factors: {
          volume: 'Volúmen i peso — nos ta kobra riba esun di dos ku ta mas haltu.',
          destination: 'E destinashon i e tempu di biahe pa e haf ei.',
          insurance: 'Si bo ke sigurá e envío pa su balor.',
        },
      },
      faq: {
        title: 'Preguntanan frekuente',
        more: 'Bo pregunta no ta kontestá aki?',
        contact: 'Tuma kontakto ku nos',
        transit: {
          q: 'Kuantu tempu un envío ta tuma?',
          a: 'Konta ku 18 pa 28 dia for di ora bo pakete yega nos depósito. Sint Maarten ta tuma mas o ménos 18 dia, Aruba i Kòrsou 21, Boneiru 24 i Sürnam 28 dia.',
        },
        customs: {
          q: 'Mi mester regla aduana mi mes?',
          a: 'Nò. Nos ta prepará i entregá e papelnan di aduana pa bo. Derecho di importashon i belasting lokal na e destinashon ta keda pa bo kuenta; nos ta bisa bo di antemano kiko bo mester spera.',
        },
        vat: {
          q: 'Mi ta haña e BTW bèk?',
          a: 'Pasobra bo òrdu ta sali for di Hulanda, hopi biaha bo por haña eksenshon di BTW. Esei ta spar te 21% riba e preis di kumpra. Nos ta bisa bo pa kada webshop si esaki ta posibel i ki datos ta nesesario.',
        },
        prohibited: {
          q: 'Kiko mi no por manda?',
          a: 'Nos no por transportá material peligroso, likido inflamabel, baterij di litio lòs, arma, kuminda ku ta daña, plaka òf bestia bibu. Si bo tin duda tokante un artíkulo, puntra nos promé ku bo bestel.',
        },
        insurance: {
          q: 'Mi envío ta sigurá?',
          a: 'Pa defekto e kobertura básiko di e transportista ta konta, i esei ta basá riba peso i no riba balor. Ora bo registrá e envío bo por sigurá e pa e balor di kumpra; nos ta rekomendá esei pa elektróniko i otro artíkulo balioso.',
        },
      },
    },
    contact: {
      eyebrow: 'TUMA',
      title: 'KONTAKTO',
      breadcrumb: 'Kontakto',
      formTitle: 'Manda nos un mensahe',
      lead:
        'Pregunta tokante un enbio, un preis, of loke nos ta hasi? Yama of manda nos un e-mail, of yena e formulario akibou.',
      charactersToGo: 'Ainda {count} karakter di ta.',
      addressTitle: 'Datos di kontakto',
      fields: {
        name: 'Nòmber',
        email: 'E-mail',
        subject: 'Asunto',
        message: 'Mensahe',
      },
      subjects: [
        'Pregunta general',
        'Enbio & tracking',
        'Enbio liber di BTW',
        'Keho',
        'Kolaborashon',
      ],
      errors: {
        name: 'Yena bo nòmber.',
        emailRequired: 'Yena bo direkshon di e-mail.',
        emailInvalid: 'E direkshon di e-mail aki no ta parse korekto.',
        message: 'Bo mensahe mester tin por lo ménos 10 karakter.',
        invalid: 'Kontrolá e datonan ku bo a yena.',
        tooMany: 'Muchu mensahe mandá. Purba atrobe den un ora.',
        offline: 'Manda no ta funshoná awor. Purba atrobe mas lat.',
      },
      submit: 'Manda mensahe',
      sending: 'Ta manda…',
      success:
        'Danki! Bo mensahe a wòrdu mandá — nos ta kontestá den dos dia di trabou.',
      details: {
        address: 'Adres:',
        phone: 'Telefon:',
        email: 'E-mail:',
      },
      openInMaps: 'Habri den Maps',
      mapLabel: 'Lokashon riba mapa',
      mapTitle: 'Mapa ku e lokashon na Hertzstraat 10, Berkel en Rodenrijs',
    },
    // Notifications: the alert in the corner and the bell in the header
    // (src/components/Notifications). NOTE: needs review by a native speaker.
    notifications: {
      title: 'Notifikashonnan',
      bell: 'Notifikashonnan',
      bellUnread: 'Notifikashonnan, {count} no lesá',
      readAll: 'Marka tur komo lesá',
      empty: 'Bo no tin notifikashon ainda.',
      open: 'Mira',
      closeAlert: 'Sera notifikashon',
      shipment: 'Enbio {tracking}',
      receivedItem: '{item} (di {shop})',
      confirmationRequested: '{booking} · {item} (di {shop})',
      status: {
        received: 'Bo enbio a yega na nos depósito',
        quoted: 'Bo ofèrta ta kla',
        paid: 'Pago risibí',
        purchased: 'Bo produktonan a wòrdu kumprá',
        ready_for_shipping: 'Bo enbio ta paká i kla pa sali',
        in_transit: 'Bo enbio ta na kaminda',
        arrived: 'Bo enbio a yega',
        delivered: 'Bo enbio a wòrdu entregá',
        cancelled: 'Bo enbio a wòrdu kanselá',
        courier_delivered: "Bo òrdu a wòrdu entregá na nos pakus",
        courier_delivery_failed: "E kurier no por a entregá bo òrdu",
        courier_delayed: "Bo òrdu tin atraso",
        courier_returned: "Bo òrdu ta bai bèk na e tienda",
        courier_exception: "Tin un problema ku e entrega di bo òrdu",
        item_received: 'Un produkto di bo òrdu a yega na nos depósito',
        order_received: 'Bo òrdu a yega na nos depósito',
        invoice_requested: 'Nos ta falta e faktura di bo òrdu',
        confirmation_requested: 'Konfirmashon di òrdu rekeri',
        prealert_submitted: "Bo pre-alerta a wòrdu registrá",
        other: 'Tin notisia tokante bo enbio',
      },
      invoice: {
        title: 'Faktura nobo',
        text: 'Faktura {invoice} pa enbio {tracking} ta kla pa bo.',
      },
    },

    // The FAQ page (src/pages/Faq). Which categories and questions there are,
    // in which order, and which page a question links to, is set in
    // src/pages/Faq/faqContent.js; every language must have the same keys
    // (a test checks this). {address} is filled in from src/data/company.js.
    // NOTE: the Papiamentu FAQ needs review by a native speaker.
    chat: {
      ask: 'Hasi bo pregunta na nos asistente',
      title: 'Asistente',
      subtitle: 'Preguntanan, kosto di manda i yudansa ku reservá',
      back: 'Bèk na yudansa',
      welcome: 'Halo! Mi ta e asistente di Pay Less Shop More. Mi por kontestá preguntanan, kalkulá kosto di manda i yuda bo yena e formulario di reservashon. Kon mi por yuda bo?',
      suggestions: {
        costs: 'Kuantu e ta kosta pa manda pa Kòrsou?',
        booking: 'Yuda mi yena e formulario di reservashon',
        how: 'Kon e ta funshoná?',
        parcel: 'Unda mi pakete ta?',
      },
      placeholder: 'Skirbi bo pregunta…',
      send: 'Manda',
      thinking: 'E asistente ta skirbiendo un kontesta',
      disclaimer: 'AI ta skirbi e kontestanan i nan por kontené fout. Preisnan ta un indikashon.',
      errors: {
        tooMany: 'Bo a hasi hopi pregunta. Purba atrobe despues di un ratu, òf tuma kontakto ku nos.',
        unavailable: 'E asistente no por kontestá awor. Purba atrobe mas lat, òf tuma kontakto ku nos.',
      },
    },
    faq: {
      title: 'Preguntanan frekuente',
      summary:
        'Kontesta riba e preguntanan ku nos ta haña mas: tokante manda kos, outo, buska i entregá, paka, gastunan lokal, seguro i pago.',
      intro: 'Riba e página aki bo ta haña kontesta riba preguntanan frekuente. Klek riba un tema pa mira su preguntanan.',
      important: {
        title: 'Importante ora di manda merkansia',
        lead: 'Pa motibu di kontrol stret di doana riba e islanan, ta obligatorio pa entregá e dokumentonan korekto:',
        items: [
          'Pa merkansia nobo: un faktura.',
          'Pa merkansia usá: un lista di paki kompleto i kla, ku e balor (aktual) di kada kos.',
          'Pa vehíkulo motorisá: un faktura of un deklarashon di balor. Motor of scooter for di Alemania no ta wòrdu aseptá.',
        ],
        after: 'Sin e dokumentonan aki nos no por manda bo merkansia.',
      },
      more: 'Bo pregunta no ta aki?',
      contactUs: 'Tuma kontakto ku nos',
      categories: {
        goods: {
          title: 'Manda merkansia',
          questions: {
            appointment: {
              q: 'Mi mester traha un sita pa bini na ofisina?',
              a: 'No ta obligatorio, pero nos ta rekomendá esaki. Si bo yama di antemano pa laga nos sa ku bo ta bini, nos por risibí bo na nos ofisina na {address}.',
            },
            arrival: {
              q: 'Ki ora mi ta tende ku mi merkansia a yega?',
              a: 'Algun dia promé ku bo merkansia yega na su destino, nos agente lokal ta tuma kontakto ku esun ku ta risibí e merkansia.',
            },
            container: {
              q: 'Mi ke manda mi merkansia, pero mi no tin sufisiente pa yena un kontainer.',
              a: 'Esei no ta problema na Pay Less Shop More. Bo por manda bo merkansia den un envio di groupage. Bo ta kompartí e kontainer, i p’esei tambe e gastunan lokal, ku otro hende.',
              link: 'Mira nos servisionan',
            },
            volume: {
              q: 'Mi ke pidi un ofèrta, pero mi no sa kuantu meter kubiko mi tin pa manda.',
              a: 'Bo por manda nos un e-mail ku e medidanan di bo kosnan personal. Tambe nos ta ofresé pa bini serka bo, grátis i sin ningun obligashon, pa mira i midi bo merkansia.',
              link: 'Tuma kontakto',
            },
          },
        },
        car: {
          title: 'Manda un outo',
          questions: {
            pickup: {
              q: 'Boso ta bini buska mi outo tambe?',
              a: 'No, nos no ta kore den vehíkulo di otro hende. P’esei nos ta pidi kliente semper pa trese nan vehíkulo na nos pakus na Rotterdam. Si bo no tin otro manera pa transportá e outo, tuma kontakto ku nos pa papia tokante e posibilidatnan.',
            },
            cargo: {
              q: 'Mi por manda kos den mi outo?',
              a: 'Sí, bo por manda merkansia den bo outo, basta e outo keda por wòrdu manehá i bo entregá un lista di paki di tur loke tin den dje.',
            },
            deregister: {
              q: 'Boso ta dal mi outo di baha?',
              a: 'Sí, nos ta dal e outo di baha na RDW pa bo. P’esei nos mester tur e papelnan di e outo i un kopia di bo identifikashon. Despues bo ta haña e papelnan bèk, si ta nesesario pa medio di pòst.',
            },
          },
        },
        pickupDelivery: {
          title: 'Buska i entregá merkansia',
          questions: {
            home: {
              q: 'Boso ta bini buska merkansia na mi kas tambe?',
              a: 'Sí, nos ta buska merkansia na e adrès ku bo skohe. E preis ta dependé di kuantu meter kubiko i unda bo ta biba.',
            },
            webshop: {
              q: 'Si mi ta pidi algu na un kompania, mi por laga nan manda esaki direkt na boso pakus?',
              a: 'Sí, esei por. Laga nos sa kla ki ora nos por warda e merkansia. Bo ta haña nos oranan di habri i nos detayenan di kontakto riba e página di kontakto.',
              link: 'Bai na e página di kontakto',
            },
            weekend: {
              q: 'Boso ta buska mi merkansia den fin di siman tambe?',
              a: 'No, esei no ta usual. Tuma kontakto ku un di nos trahadónan pa papia tokante e posibilidatnan.',
            },
            delivery: {
              q: 'Boso ta entregá mi merkansia na e adrès ku mi duna?',
              a: 'Nos servisio ta yega te na e haf di destino. Sinembargo, bo merkansia por wòrdu hiba na e adrès ku bo skohe: nos ta pasa esaki pa nos agente lokal, ku ta regla esaki.',
            },
          },
        },
        packing: {
          title: 'Paka merkansia',
          questions: {
            seaworthy: {
              q: 'Kon mi ta sigurá ku mi merkansia ta paká bon pa e biahe riba laman?',
              a: 'Bo por usa nos servisio di paka; nos ta entregá tambe e material korekto. Bo por paka bo merkansia bo mes tambe. Ora bo anunsiá un envio, bo ta skohe ken ta paka.',
              link: 'Anunsiá un envio',
            },
          },
        },
        localCosts: {
          title: 'Gastunan lokal',
          questions: {
            what: {
              q: 'Kiko ta gastunan lokal?',
              a: 'Gastunan lokal ta e gastunan ku ta wòrdu hasí na e destino, manera deskargá e kontainer. Nan ta wòrdu pagá na e agente lokal i no ta inkluí den nos preisnan di ofèrta.',
            },
            emigrate: {
              q: 'Mi ta paga gastunan lokal tambe si mi ta emigrá?',
              a: 'Bo ta paga gastunan lokal, pero bo por importá bo merkansia liber di derechi di entrada. P’esei bo mester ta saká afó di registro na Hulanda i inskribí den e pais di destino.',
              link: 'Mira e destinonan',
            },
            prepay: {
              q: 'Pakiko mi no por paga e gastunan lokal di antemano?',
              a: 'Ta difísil pa nos kalkulá kuantu e gastunan lokal lo ta. Den algun kaso doana mes ta determiná e balor di e merkansia, p’esei nos nunka por ta sigur di e suma di e gastunan aki.',
            },
          },
        },
        insurance: {
          title: 'Seguro',
          questions: {
            insured: {
              q: 'Mi merkansia ta asegurá?',
              a: 'Bo merkansia no ta asegurá standart. Bo por saka un seguro di transporte via nos. Tuma kontakto ku nos pa mas informashon.',
              link: 'Tuma kontakto',
            },
            damage: {
              q: 'Kiko ta pasa si mi merkansia daña?',
              a: 'Daño durante e biahe no ta wòrdu kompensá si bo no a saka un seguro di transporte.',
              link: 'Puntra pa un seguro',
            },
          },
        },
        payment: {
          title: 'Pago',
          questions: {
            how: {
              q: 'Kon e pago ta funshoná?',
              a: 'Si nos bini buska bo merkansia, bo por paga e faktura kèsh òf via banko. Si bo ke ta sigur di un lugá riba e barku, bo ta hasi un pago adelantá (den kombinashon ku nos). E suma kompleto mester ta pagá semper promé ku e merkansia sali for di Rotterdam.',
            },
          },
        },
      },
    },

    // The Terms & Conditions page (src/pages/Terms). Only the page around the
    // conditions is translated: the conditions themselves are in English in
    // src/data/terms.js (legal text, the Dutch original prevails).
    terms: {
      title: 'Kondishonnan general',
      summary:
        'E kondishonnan di ekspedishon i di warda den pakus di Pay Less Shop More: e areglonan ku ta bal pa kada envio i pa warda den nos pakus.',
      languageNote:
        'E kondishonnan aki ta den Ingles ariba. Si e teksto Ingles ta diferente for di e teksto Hulandes, e teksto Hulandes ta desisivo.',
      contents: 'Kontenido',
      article: 'Artíkulo',
      section: 'Seccion',
      incomplete: 'E resto di e kondishonnan aki lo wòrdu agregá pronto. Tuma kontakto ku nos si bo mester e teksto kompleto.',
      questions: 'Bo tin un pregunta tokante e kondishonnan aki? Tuma kontakto ku nos via',
      backToTop: 'Bai bek ariba',
    },

    // The privacy statement (src/pages/Privacy). The order of the sections
    // is set in Privacy.jsx; every language must have the same keys and the
    // same number of items in each list (a test checks this).
    // {address} and {number} are filled in from src/data/company.js.
    // NOTE: needs review by a native speaker. For any legal dispute, the
    // Dutch text is the original.
    privacy: {
      title: 'Maneho di privasidat',
      summary:
        'Kon Pay Less Shop More ta trata bo datonan personal: kiko nos ta kolektá, pakiko, ku ken nos ta kompartí nan i kiko ta bo derechonan.',
      questions: 'Bo tin un pregunta tokante e maneho di privasidat aki? Tuma kontakto ku nos via',
      intro: [
        'Bo privasidat ta importante pa nos na Pay Less Shop More. Nos ta usa bo datonan personal úniko pa maneha bo kuenta i pa duna bo nos servisionan. Nos ta duna hopi importansia na e protekshon, konfidensialidat i integridat di bo datonan personal. Den e deklarashon di privasidat aki nos ta splika kua datonan personal nos ta kolektá ora bo usa nos servisionan, pakiko nos tin mester di e datonan aki i kon nos ta usa nan.',
      ],
      sections: {
        services: {
          heading: 'Nos servisionan',
          body: [
            'Pay Less Shop More ta ofresé transporte di bo merkansia komo ekspeditor. E deklarashon di privasidat aki ta aplikabel pa e servisionan aki i e plataformanan relashoná.',
          ],
        },
        data: {
          heading: 'Kua datonan personal ta wordu kolektá?',
          body: [
            'Nos mester di sierto datonan personal pa duna bo e mihó servisio posibel i pa informá bo tokante nos servisionan.',
            'Ora bo usa e servisionan di Pay Less Shop More, nos ta prosesá e datonan aki:',
          ],
          list: [
            'Nòmber i fam',
            'Direkshon di e-mail',
            'Number di telefòn',
            'Adres di kas',
            'Nòmber di kompania (si ta aplikabel)',
          ],
        },
        thirdParties: {
          heading: 'Terseronan',
          body: [
            'Nos ta risibí tambe informashon di terseronan ku kende nos ta kolaborá. Aunke nos sosionan por kambia, esakinan ta:',
          ],
          list: [
            'Nos agentenan na e diferente destinashonnan, esta: Fast Delivery Services, Anper NV i Cavalier Logistics.',
            'Suplidónan ku ta entregá merkansia pa bo, ku nos despues ta manda bai pa bo.',
          ],
        },
        purposes: {
          heading: 'Kon nos ta usa bo datonan personal?',
          body: [
            'Nos ta usa bo datonan personal eksklusivamente pa e propósitonan pa kua nan a wordu kolektá i, unda ta aplikabel, pa kumpli ku obligashonnan legal. Nos ta usa bo datonan personal pa e propósitonan aki:',
          ],
          items: [
            {
              term: 'Ehekushon di e akuerdonan.',
              text: 'Nos ta prosesá bo datonan personal pa duna bo e servisionan ku bo a skohe.',
            },
            {
              term: 'Kontakto ku kliente i komunikashon.',
              text: 'Nos ta usa bo datonan pa komuniká ku bo pa e-mail òf telefòn tokante nos servisionan. Asina bo por risibí faktura di nos, i nos por tene bo na altura di bo enbio i invitá bo pa partisipá den enkuestanan di satisfakshon di kliente.',
            },
            {
              term: 'Marketing.',
              text: 'Nos ta gusta tene bo na altura di nos servisionan via e-mail òf medionan sosial. Bo tin semper e derecho pa kita bo nòmber for di e informashon aki.',
            },
            {
              term: 'Siguridat, protekshon i solushon di konflikto.',
              text: 'Nos ta usa bo datonan pa garantisá e siguridat, integridat i protekshon di nos servisionan i klientenan. Unda ta nesesario, nos por usa bo datonan den solushon di konflikto, pa hasi kumpli ku e akuerdo ku bo, pa defendé nos derechonan kontra terseronan, òf pa defendé nos mes kontra reklamo òf akusashon di terseronan.',
            },
            {
              term: 'Obligashonnan legal.',
              text: 'Nos por prosesá bo informashon pa kumpli ku obligashonnan legal, por ehempel pa tene registro òf pa kumpli ku petishonnan legítimo di outoridatnan kompetente (por ehempel polis òf hustisia).',
            },
            {
              term: 'Mehorá i personalisá nos servisionan.',
              text: 'Nos ta usa bo datonan personal pa mehorá nos servisionan. Por ehempel, informashon tokante kon hende ta klek i buska riba nos website por yuda nos optimalisá nos servisionan.',
            },
            {
              term: 'Mantenshon, desaroyo i manehamentu di insidente.',
              text: 'Si bo tin problema ku un di nos servisionan, por ta nesesario pa prosesá datonan personal pa haña un solushon. Nos ta prosesá bo datonan personal tambe pa sierto prosesonan operashonal interno, por ehempel ora nos ta pasa datonan di kliente over na un base di dato nobo.',
            },
            {
              term: 'Ehekushon di prosesonan general di negoshi, manehamentu interno i raportahe pa gerensia.',
              text: 'Pa ehekutá nos aktividatnan di negoshi, nos ta usa bo datonan personal pa prosesonan general di negoshi. Por ehempel, nos ta prosesá bo datonan pa archivá, seguro, raportenan pa gerensia, oditoria i otro propósito atministrativo.',
            },
          ],
        },
        sharing: {
          heading: 'Ku ken nos ta kompartí bo datonan personal?',
          body: [
            'Nos ta kompartí bo datonan personal ku terseronan, manera agentenan na bo destinashon i otro sosionan, dependiendo di e servisionan ku bo ta usa. Nos ta kompartí bo datonan:',
          ],
          list: [
            'Te asina leu ku ta nesesario pa ehekutá nos aktividatnan di negoshi, duna nos servisionan i hasi e servisionan di nos sosionan posibel. Esaki ta inkluí por ehempel ehekutá sierto transportenan, manera pa fleta pa aire, i por komuniká ku bo tokante nos servisionan;',
            'Den kasonan kaminda bo a duna nos permiso eksplísito pa hasi esaki;',
            'Si nos ta wordu pidí na un manera legal pa hasi esaki den kuadro di aplikashon di lei, por ehempel pa investigashon di aktividatnan ilegal;',
            'Pa hasi kumpli ku nos akuerdo ku bo, unda ta aplikabel. Por ehempel, si bo no a paga pa nos servisionan, nos por kompartí bo informashon ku un ofisina di kobransa;',
            'Pa defendé nos derechonan kontra terseronan òf pa defendé nos mes kontra reklamo òf akusashon di terseronan;',
            'Pa garantisá e siguridat, integridat i protekshon di nos servisionan.',
          ],
          after: [
            'Kompartimentu di datonan denter di e kompania ta sosodé eksklusivamente pa nos aktividatnan di negoshi, nos servisio na bo, i manera deskribí den e deklarashon di privasidat aki.',
          ],
        },
        location: {
          heading: 'Unda bo datonan personal ta wordu prosesá?',
          body: [
            'Bo datonan personal ta wordu prosesá prinsipalmente pa nos empleadonan na nos ofisina na Hulanda. Dependiendo di bo lokalidat i unda ta aplikabel, sierto datonan por wordu prosesá pa agentenan lokal (manera na Kòrsou), por ehempel pa e atendementu lokal òf kampañanan di marketing lokal.',
            'Te asina leu ku nos ta transferí datonan personal na un pais pafó di Union Europeo òf na un organisashon internashonal, nos ta sigurá ku esaki ta sosodé eksklusivamente na paisnan i organisashonnan ku ta garantisá un protekshon adekuá di bo datonan i derechonan di akuerdo ku e Regla General di Protekshon di Dato (GDPR), òf si esaki ta otro manera permití bou di e GDPR.',
          ],
        },
        retention: {
          heading: 'Kuantu tempu nos ta warda bo datonan personal?',
          body: [
            'Nos ta warda bo datonan personal solamente tantu tempu ku ta nesesario pa e propósitonan pa kua nan a wordu kolektá òf ta wordu usá i/òf tantu tempu ku lei ta eksigí.',
            'Si bo ke pa nos kita bo datonan, tuma kontakto ku nos ofisina. Riba bo petishon, nos ta kita bo datonan personal sin tardansa innesesario, ku eksepshon di informashon ku lei ta obligá nos pa warda. Por ehempel, lei ta obligá nos pa warda datonan manera kopia di faktura pa shete aña.',
          ],
        },
        loginMonitoring: {
          heading: 'Sigurided i kontròl di login',
          body: [
            'Pa protehá nos plataforma i bo kuenta, nos ta registrá kada intento di login, ku éksito òf fayá. Pa kada intento nos ta warda e kuenta òf adrès di e-mail ku a wordu pusha, bo adrès IP, e pais i siudat ku aproximadamente ta pertenesé na dje, e ora, e tipo di browser, sistema operativo i aparato i e manera di login. Nos nunka ta warda wachtwoord, PIN òf kódigo, ni ora nan ta robes.',
            'E meta ta pa deskubrí abusu, por ehèmpel hopi intento fayá òf un login for di un aparato inesperá. Solamente empleadonan di nos kantor ku un rol di admin por mira e datos aki. Un lugá ku no ta normal òf un aparato nobo ta solamente un señal pa nos wak, no prueba di abusu, i nos no ta tuma desishon outomátiko tokante bo kuenta riba e base aki.',
            'Nos ta determiná e lugá aproximadamente for di bo adrès IP. Nos nunka ta usa GPS òf e lokalisashon di bo aparato. Pa esei, bo adrès IP por wordu presentá na un servisio di geolokalisashon (ipwho.is). Nos ta warda e registronan di login aki pa maksimo 90 dia i despues nos ta eliminá nan. Nos base legal ta nos interes legítimo den sigurided di nos servisionan i di bo kuenta.',
          ],
        },
        legalBasis: {
          heading: 'Base legal pa prosesá datonan',
          body: [
            'Nos ta kolektá i prosesá bo datonan personal solamente ora nos tin un base legal pa hasi esaki. E basenan legal aki ta aplikabel:',
          ],
          list: [
            'E prosesamentu ta nesesario pa ehekutá bo akuerdo;',
            'E prosesamentu ta nesesario pa nos interesnan legítimo di negoshi, por ehempel i) pa ehekutá nos aktividatnan di negoshi; ii) pa sierto forma di marketing direkto i profilashon; iii) pa archivá informashon tokante bo kuenta pa bo por re-aktivá esaki despues; iv) pa detektá òf preveni fraude òf abuzo di nos servisionan; òf v) pa e siguridat di nos red i sistemanan;',
            'E prosesamentu ta nesesario pa kumpli ku un obligashon legal, manera e obligashon pa warda datonan atministrativo òf pa kompartí sierto informashon despues di un òrdu di polis pa un investigashon kriminal;',
            'Bo a duna nos permiso eksplísito pa e prosesamentu, por ehempel pa kompartí datonan ku sosionan pa propósitonan komersial.',
          ],
          after: [
            'Ora e prosesamentu ta basá riba permiso, bo tin semper e derecho pa retirá bo permiso. Den e kaso ei, nos ta stop e prosesamentu konserní di bo datonan. Retirá bo permiso no ta afektá e legalidat di prosesamentu basá riba permiso promé ku e retiro.',
          ],
        },
        complaints: {
          heading: 'Preguntanan i keho',
          body: [
            'Si bo tin pregunta tokante kon nos ta usa bo datonan personal, bo por tuma kontakto ku nos ofisina.',
            'Si bo ta sinti ku un problema no a wordu solushoná bon, bo tin tambe e derecho pa drenta un keho serka e Outoridat Hulandes di Protekshon di Dato (Autoriteit Persoonsgegevens).',
          ],
        },
        controller: {
          heading: 'Entidat responsabel',
          body: ['Pay Less Shop More ta un ekspeditor establesé na {address}.'],
          // Only shown once the number is filled in, in src/data/company.js.
          registration: 'Pay Less Shop More ta registrá na Kamara di Komersio bou di number {number}.',
          after: [
            'Desishonnan tokante e propósitonan i medionan di prosesamentu di datonan personal ta wordu tumá, en prinsipio, sentralmente na Pay Less Shop More, ku ta aktua komo responsabel pa e prosesamentu di e datonan personal aki.',
          ],
        },
      },
    },
    guide: {
      eyebrow: 'Splikashon di e página aki',
      greeting: 'Halo! Kon mi por yudabo?',
      onThisPage: 'Riba e página aki',
      more: 'Lesa mas',
      less: 'Mustra ménos',
      panelLabel: 'Splikashon di e página aki',
      openLabel: 'Habri yudansa i e splikashon di e página aki',
      hint: 'Klek akinan pa yudansa',
      hintClose: 'Sera e mensahe aki',
      close: 'Sera',
      listen: 'Lesa na bos haltu',
      stop: 'Stop',
      dontShow: 'No mustra esaki outomátikamente mas',
      pages: {
        faq: {
          title: 'Preguntanan frekuente',
          body:
            'Kontesta riba e preguntanan ku nos ta haña mas. Klek riba un tema pa mira su preguntanan i kontestanan.',
          bullets: [
            'Abou bo ta haña e dokumentonan ku doana ta pidi.',
            'Bo pregunta no ta aki? Tuma kontakto ku nos.',
          ],
        },
        blog: {
          title: 'Blog',
          body:
            'Konseho i splikashon tokante kumpra na webshop Hulandes i manda kos pa e islanan. Klek riba un artíkulo pa lesa e.',
        },
        terms: {
          title: 'Kondishonnan general',
          body:
            'E kondishonnan ku ta bal pa kada envio i pa warda den nos pakus. E teksto ta na Ingles; si e ta diferente for di e teksto Hulandes, e teksto Hulandes ta desisivo.',
          bullets: [
            'Klek riba un artíkulo den e kontenido pa bai direkt n’e.',
          ],
        },
        privacy: {
          title: 'Maneho di privasidat',
          body:
            'Kiko datonan personal nos ta kolektá, pakiko, ku ken nos ta kompartí nan i kiko ta bo derechonan.',
        },
        home: {
          title: 'Bonbiní na PayLesShopMore',
          body:
            'Aki tur kos ta kuminsá. Nos ta risibí bo òrdunan na Hulanda i manda nan pa e isla.',
          bullets: [
            'Wak "Servisionan" pa mira kiko nos por hasi pa bo.',
            'Bou di "Destinashonnan" bo ta lesa kon e ta bai pa kada isla.',
            'Kla pa manda algu? Bai na "Buking".',
          ],
        },
        services: {
          title: 'Nos servisionan',
          body:
            'Akinan bo ta mira kiko nos ta hasi pa bo, for di fleta pa laman i pa aire te na e entrega riba e isla, i na ki tiendanan nos klientenan ta hasi òrdu.',
          bullets: [
            'Skohe bo destinashon pa e detayenan di e isla ei.',
            'Bo tin duda tokante un produkto? Puntra nos promé.',
          ],
        },
        booking: {
          title: 'Anunsiá un enbio',
          body:
            'Ku e formulario di boeking aki bo ta anunsiá bo enbio serka nos, en bes di riba papel. Mas kompletu e ta, mas lihé nos por traha ku dje.',
          bullets: [
            'Skohe si bo ta yena henter e formulario un biaha òf paso pa paso.',
            'Pa kada tienda, skohe unda bo a hasi òrdu i kiko bo a kumpra. Un screenshot di bo òrdu ta yuda.',
            'Bo a drenta? Anto e boeking ta den bo kuenta despues, na "Mi boekingnan", kaminda bo por agregá e faktura òf track-and-trace tambe.',
          ],
        },
        tracking: {
          title: 'Sigui bo enbio',
          body:
            'Yena bo kódigo di tracking i bo ta mira unda bo enbio ta: serka nos den depósito, na kaminda, òf kla pa entrega.',
          bullets: [
            'E kódigo ta den e e-mail ku nos a manda bo.',
            'Akinan bo por sigui solamente e enbionan di bo kuenta.',
          ],
        },
        destinations: {
          title: 'Nos destinashonnan',
          body:
            'Skohe e isla kaminda bo enbio ta bai. Kada destinashon ta splika e tempu di biahe, e posibilidatnan i kon entrega ta bai.',
        },
        destination: {
          title: 'E destinashon aki',
          body:
            'Aki ta pará kon nos ta manda pa e isla aki i kiko bo por spera. Abou bo por pidi un preis mesora.',
        },
        profile: {
          title: 'Bo kuenta',
          body:
            'Bo datonan, adresnan, enbionan i fakturanan tur ta warda aki, i Track & Trace tambe.',
          bullets: [
            'Tene bo adres di entrega aktualisá — ta einan bo enbio ta bai.',
            'Bo por baha fakturanan i pakbon aki.',
            'Avisá un pakete promé na "Mi enbionan". No ta nesesario mas pa duna un balor.',
            'Den un enbio, skohe "Entregá" òf "Mi ta bin buska e". Bo ta skohe un biaha so; despues un kambio ta pa e-mail.',
          ],
        },
        prealert: {
          title: 'Avisá un pakete promé',
          body:
            'Aki bo ta laga nos sa ku un pakete ta na kaminda pa nos pakus. Asina nos sa ku e ta di bo apenas e yega.',
          bullets: [
            'E number di tracking i e kurier ta den e e-mail di enbio di e tienda.',
            'No ta nesesario pa duna un balor.',
            'Agregá e faktura di e tienda, anto duana ta bai mas lihé.',
          ],
        },
        login: {
          title: 'Login',
          body:
            'Login ku e adres di e-mail ku bo a registrá kuné. Bo a lubidá bo kontraseña? Usa e link bou di e formulario — e e-mail ta yega den algun minüt.',
        },
        signup: {
          title: 'Habri un kuenta',
          body:
            'Yena bo nòmber, adres di e-mail i un kontraseña. Despues bo por anunsiá i sigui bo enbionan.',
          bullets: [
            'Usa un e-mail ku bo ta lesa tur dia: tur loke nos ta manda ta bai einan.',
            'Bo adres di entrega bo por yena despues den bo kuenta.',
          ],
        },
        contact: {
          title: 'Tuma kontakto',
          body:
            'Hasi bo pregunta aki. Menshoná bo kódigo di tracking òf number di òrdu si e ta tokante un enbio, asina nos por wak mesora.',
        },
      },
    },
    // The onboarding tour (src/components/Tutorial) and its "?" help button.
    // Steps: onboarding.steps.<id> must match the ids in
    // src/components/Tutorial/tutorialSteps.js. Each step has a `title` and
    // optionally `text`, `points` (bullet list), `note` and `warning`.
    // Shipping times are NOT here: they come from src/data/destinations.js.
    // NOTE: needs review by a native speaker, like the rest of this section.
    onboarding: {
      stepOf: 'Paso {current} di {total}',
      progressLabel: 'Progreso di e gia',
      duration: 'Mas o ménos 2 minüt',
      start: 'Kuminsá e gia',
      skip: 'Salta e gia',
      close: 'Sera e gia',
      back: 'Atras',
      next: 'Siguiente',
      finish: 'Kaba',
      openWebsite: 'Habri e website',
      steps: {
        welcome: {
          title: 'Bon bini na Pay Less Shop More',
          text: 'Laga nos hasi un tur kòrtiku i mustra bo kon kumpra i manda ta funshoná.',
        },
        account: {
          title: 'Traha bo kuenta',
          text: 'Traha bo kuenta di Pay Less Shop More pa bo por maneha bo ordernan, enbionan i informashon personal.',
          points: [
            "Usa e boton \"Registrá\" ariba den e página. Riba un telefòn bo ta hañ'é den e menu (☰).",
            'Yena bo mes informashon personal: bo mes nòmber, e-mail i number di telefòn.',
          ],
        },
        shop: {
          title: 'Kumpra na bo tiendanan faborito',
          text: 'Kumpra produktonan na webshopnan hulandes i laga nan entregá bo kompranan na nos warehouse na Hulanda.',
          points: [
            'Ora bo ta paga, usa e adres di warehouse di Pay Less Shop More komo adres di entrega. Den e siguiente paso bo ta mira eksaktamente kiko pa yena.',
          ],
          note: 'Paga bo order mesora. No ta permití pa paga despues.',
        },
        address: {
          title: 'Manda bo order pa nos warehouse',
          text: 'Ora bo ta ordená na un webshop hulandes, usa e adres aki pa e informashon di faktura i tambe pa e adres di entrega.',
          warning: 'Sigurá bo ta yena e adres di warehouse eksaktamente manera e ta aki, pa faktura i pa entrega. Si e no ta yená korekto, nos no por prosesá bo enbio.',
        },
        // {email} is filled in from src/data/company.js.
        register: {
          title: 'Anunsiá bo enbio serka nos',
          text: 'Despues di ordená, laga nos sa ku un pakete ta na kaminda pa nos warehouse. Asina nos sa ku e ta di bo apenas e yega.',
          points: [
            'Avisá e pakete promé den bo kuenta (Mi enbionan), ku e number di tracking i e kurier.',
            'Agregá e faktura di e webshop, anto duana ta bai mas lihé.',
          ],
        },
        warehouse: {
          title: 'Bo pakete ta yega na nos warehouse',
          text: 'Ora bo pakete yega na nos warehouse, nos ta prosesá esaki i prepará e pa manda pa bo destinashon.',
        },
        shipping: {
          title: 'Skohe bo manera di manda',
        },
        track: {
          title: 'Sigui bo enbio',
          text: 'Usa Track & Trace pa wak e último informashon disponibel tokante bo enbio.',
          points: [
            'Track & Trace ta den bo kuenta: drenta i klek riba bo nòmber ariba den e página.',
            'E informashon ta aparesé apenas e ta disponibel pa bo enbio.',
          ],
        },
        // The "Feedback" tab on the right edge (components/Feedback).
        feedback: {
          title: 'Bisa nos kiko bo ta pensa',
          text: 'Ku e boton hel "Feedback" na banda drechi di kada página bo por duna nos strea i un komentario. Despues di un entrega nos ta pidi bo tambe pa evaluá esaki.',
        },
        help: {
          title: 'Bo mester yudansa?',
          text: 'Nos tim ta yuda bo ku gusto ku preguntanan tokante:',
        },
      },
      address: {
        firstName: 'Nòmber',
        lastName: 'Fam',
        street: 'Adres',
        postcode: 'Kódigo postal',
        city: 'Stat',
        country: 'Pais',
        countryValue: 'Hulanda',
        copy: 'Kopia adres',
        copied: 'Adres kopiá!',
        copyFailed: "Kopiamentu no a bai bon. Selekshoná e adres i kopi'é bo mes.",
      },
      flow: {
        label: 'For di webshop te bo destinashon',
        store: 'Webshop',
        warehouse: 'Warehouse di Pay Less Shop More',
        shipping: 'Enbio',
        destination: 'Bo destinashon',
      },
      shipping: {
        allIslands: 'Tur isla',
        faster: 'E opshon mas lihé.',
        disclaimer: 'Esakinan ta estimashon. E tempu real ta dependé di e skedel di enbio i e sirkunstansianan.',
        quoteQuestion: 'Bo ke sa kuantu e ta kosta?',
        quoteLink: 'Skohe bo isla i pidi un preisnota',
      },
      help: {
        topics: [
          'Kosto di enbio',
          'Aduana',
          'Kosnan grandi',
          'Enbio komersial',
          'Otro destinashon',
          'Preguntanan general',
        ],
        contact: 'Tuma kontakto ku nos tim:',
        again: 'Riba kada página, klek riba e robot abou na banda robes i skohe "Tur dor di e página aki": e ta splika e página ei. Riba e página prinsipal e ta kuminsá e gia aki di nobo.',
        doneTitle: 'Bo ta kla!',
        doneText: 'Awor bo sa e base di kumpra i manda ku Pay Less Shop More.',
      },
      // The page tours: one per page, started from the robot's "Tur dor di
      // e página aki". The step ids match pageTours in
      // src/components/Tutorial/tutorialSteps.js.
      // NOTE: needs review by a native speaker.
      pages: {
        // The warehouse tour (pageTours.warehouse in tutorialSteps.js).
        warehouse: {
          welcome: {
            title: 'Bon bini na e pakus',
            text: 'Un splikashon kòrtiku di kon e pakus ta traha. E ta tuma mas o ménos un minüt; bo por stop ora bo ke.',
            points: [
              'Skan un pakete i atendé kuné paso pa paso',
              'Kuminsá un formulario di intake pa mercancía ku ta drenta',
              'Mira tur pakete ku ta den e pakus',
            ],
          },
          scan: {
            title: 'Skan pakete',
            text: 'Kuminsá aki ora un kaha yega òf ora bo kohe un. Skan e barcode òf QR-code riba e label ku e kamera, òf tek e number di tracking.',
          },
          package: {
            title: 'E página di e pakete',
            text: 'Despues di skan, e pakete ta habri. Traha di ariba pa abou:',
            points: [
              'Kontrolá: kompará e datonan ku e label',
              'Midi: peso, largura, hanchura i haltura',
              'Midí kaba riba e formulario di intake? Anto bo ta salta Midi',
              'Kla: marka e komo kla pa manda',
              'Ei bo ta reportá daño tambe (ku potrèt), sera e, i imprimí e label',
            ],
          },
          newSheet: {
            title: 'Formulario di intake nobo',
            text: 'Pa mercancía ku ta yega sin kódigo pa skan, òf un entrega di vários kaha. E ta habri un formulario di intake bashí.',
          },
          intake: {
            title: 'E formulario di intake',
            text: 'Paso pa paso (òf skohe "Formulario kompleto" ariba). Siguiente ta warda bo trabou:',
            points: [
              'Envio: e number di envio ta fiho; skan e label i tòk e nòmbernan den Afzender, Ontvanger, ...',
              'Schade aanwezig? Ja: saka potrèt di e daño',
              'Midi: un liña pa kada tamaño di kaha. E ta konta pa e pakete tambe, bo ta midi un biaha so',
              'Libra i manda e team un e-mail ora tur kos ta yená',
            ],
            note: 'Wardá konsepto ta wardá bo trabou; nada no ta wòrdu mandá te ora bo libr\'é.',
          },
          list: {
            title: 'Paketenan den pakus',
            text: 'E paketenan di e blòki ku bo a skohe, e di mas bieu promé. Tòk riba un pa habri su página; un etiketa di koló ta bisa pakiko e mester atenshon. E kashi di búsketa ta buska den tur pakete, tambe esnan ku a sali kaba.',
          },
          filters: {
            title: 'E sifranan',
            text: 'Kuantu pakete tin den pakus, kuantu mester atenshon, ta kla pa manda i ta na kaminda. Tòk riba un blòki pa mira e paketenan ei den e lista abou.',
          },
          menu: {
            title: 'E menú',
            text: 'Na banda robes, òf abou na un telefòn:',
            points: [
              'Home: e página aki',
              'Skan: e skèner',
              'Formularionan di intake: tur formulario di intake, tambe esnan di prome',
              'Perfil: bo datonan, PIN i e-mailnan di entrega',
            ],
          },
          help: {
            title: 'Bo ke mira esaki atrobe?',
            text: 'Primi Gia ora ku bo ke pa kuminsá e splikashon aki atrobe.',
          },
        },
        // The office dashboard tour (pageTours.dashboard in tutorialSteps.js).
        dashboard: {
          welcome: {
            title: 'Bon bini na e dashboard',
            text: 'Un splikashon kòrtiku di e dashboard di ofisina. E ta tuma mas o ménos un minüt; bo por stop ora bo ke.',
            points: [
              'Unda bo ta haña oferta, rekuestnan di bùk i mensahe nobo',
              'Kon bo ta maneha enviamentu, faktura i kliente',
              'Unda bo ta haña e splikashon aki atrobe despues',
            ],
          },
          overview: {
            title: 'Resumen',
            text: 'Kuminsá aki tur dia. Bo ta mira kiko ta warda, e sifranan di e periodo ku bo a skohe i kiko e pakus ta reportá. Atendé ku loke ta kòrá (daño, mester atenshon) prome.',
          },
          sales: {
            title: 'Benta',
            text: 'E trabou ku ta drenta via e website:',
            points: [
              'Oferta: petishonnan di e páginanan di destinashon. Pone e status riba Oferta mandá, Aseptá òf Rechasá',
              'Bùk: yena e number di enviamentu, volumen i peso, despues konfirmá òf marka komo Mandá',
              'Mensahe: kontestá pa e-mail, despues marka komo atendí',
            ],
            note: 'E number banda di un artíkulo den e menú ta kuantu ta warda ainda.',
          },
          shipments: {
            title: 'Enviamentu',
            text: 'Pakete: move kada pakete den su pasonan, di Oferta mandá i Pagá te Entregá. Na In transit i Entregá e fecha ta wòrdu yená di su mes. Medida: loke e pakus a midi i pisa.',
          },
          billing: {
            title: 'Faktura',
            text: 'Un faktura ta wòrdu traha di su mes ora un pakete ta wòrdu marká Pagá. Kontrolá i aprobá (anto e kliente ta hañ\'é) òf rechasá ku un motibu. Na Dokumento bo ta haña e resibu i formularionan ku kliente ta subi.',
          },
          people: {
            title: 'Hende',
            text: 'Tur hende ku un kuenta:',
            points: [
              'Kliente: buska, korigí datos, habri òf eliminá un kuenta',
              'Trahadó: koleganan, nan ròl, i kódigo di drenta pa e pakus',
              'Akseso di pakus i Aparato di vloer: kiko e pakus por mira, i e telefòn i skèner kompartí',
            ],
            note: 'Ta djis un atministradó por kambia ròl i eliminá kuenta.',
          },
          website: {
            title: 'Website',
            text: 'Tienda i blog. Loke bo warda aki ta keda mesora riba e website. Un artíkulo di blog ta keda skondí te ora bo marka Publiká.',
          },
          warehouse: {
            title: 'Pakus',
            text: 'E linknan aki ta habri e app di pakus: skan, formulario di intake i e página di kada pakete. E tin su mes splikashon.',
          },
          search: {
            title: 'Buska',
            text: 'Ta buska den e lista ku bo ta aden: un nòmber, e-mail òf number di tracking. Un number di tracking kompleto (òf un skan) ta habri e pakete mesora.',
          },
          foot: {
            title: 'Bo kuenta',
            text: 'Ta mustra ku kua kuenta i ròl bo a drenta, ku link pa Django admin, bèk na e website, i Sali.',
          },
          help: {
            title: 'Bo ke mira esaki atrobe?',
            text: 'Primi Gia den e bara ariba. Riba kada otro página, Gia ta splika e página ei.',
          },
        },
        // The Customers page tour (pageTours.dashboardCustomers).
        dashboardCustomers: {
          intro: {
            title: 'Kliente',
            text: 'Tur hende ku ta manda ku nos. Esaki ta e mesun datonan ku kliente ta mira riba nan mes página di perfil, pues loke bo korigí aki, nan ta mira tambe.',
          },
          filters: {
            title: 'Buska i filtra',
            text: 'Buska pa nòmber, e-mail, telefòn òf stat. Kuenta ta skohe kuenta aktivo òf limpiá; Ròl ta mustra koleganan tambe.',
          },
          create: {
            title: 'Kuenta nobo',
            text: 'Habri un kuenta pa un hende. Yena nòmber, e-mail i telefòn; nan ta haña un e-mail pa skohe nan mes kontraseña. Abo nunka ta mir\'é.',
          },
          table: {
            title: 'E tabla',
            text: 'Pa kada kliente: datos di kontakto, adrès, enviamentu, i kiko ta pagá i ainda habrí.',
            points: [
              'Edit details: korigí nòmber, e-mail, telefòn i adrès',
              'Role: skohe un otro ròl, e ta wòrdu wardá mesora',
            ],
          },
          delete: {
            title: 'Eliminá un kuenta',
            text: 'Ku e boton kòrá Delete na banda drechi. Sin enviamentu e kuenta ta disparsé kompletamente. Ku enviamentu ta djis e datos personal ta wòrdu limpiá; e enviamentu i fakturanan ta keda wardá.',
            note: 'Esaki no por wòrdu deshasí.',
          },
        },
        // The Invoices page tour (pageTours.dashboardInvoices).
        dashboardInvoices: {
          intro: {
            title: 'Faktura',
            text: 'Un faktura ta aparesé aki di su mes apenas un pakete ta wòrdu marká Pagá. Tur faktura mester wòrdu aprobá promé ku e kliente mir\'é.',
          },
          filters: {
            title: 'Buska i filtra',
            text: 'Buska pa kliente, number di faktura òf number di tracking. Status ta mustra por ehèmpel djis loke ta warda riba kontrol; Kliente ta mustra e fakturanan di un kliente.',
          },
          table: {
            title: 'E lista',
            text: 'Pa kada faktura: number, kliente, enviamentu, fecha, suma i status. Fakturanan ku ta warda riba kontrol ta marká.',
            points: [
              'Pending review: bo mester revis\'é',
              'Approved: kla, pero e kliente no por mir\'é ainda',
              'Rejected: e motibu ta bou di dje',
              'Sent: e ta riba e página di perfil di e kliente',
            ],
          },
          review: {
            title: 'Revisá',
            text: 'Klek riba View pa habri e faktura i kontrolá e liñanan, sumanan i kliente.',
            points: [
              'Approve: e PDF ta wòrdu traha i e faktura ta bai riba e perfil di e kliente',
              'Reject: skirbi kiko ta malu, pa e por wòrdu korigí',
              'Send to customer: pa un faktura aprobá ku tin un dokumento kaba',
            ],
            note: 'Ta wòrdu registrá ken a aprobá òf rechasá kada faktura, i ki ora.',
          },
          new: {
            title: 'Faktura nobo',
            text: 'Skirbi un faktura bo mes den e editor di faktura, por ehèmpel pa un enviamentu ku nunka a pasa via Pagá.',
          },
          upload: {
            title: 'Subi PDF',
            text: 'Bo tin e faktura kaba komo PDF? Sub\'é aki. Subi e ta aprobá e faktura na bo nòmber i ta pon\'é riba e perfil di e kliente.',
          },
          settings: {
            title: 'Konfigurashon',
            text: 'E listanan ku e editor di faktura ta skohe for di dje: haf i tipo di kosto (manera vrachi, seguro, manehamentu). Ta djis un atministradó por kambia nan.',
          },
        },
        // The Quotes page tour (pageTours.dashboardQuotes).
        dashboardQuotes: {
          intro: {
            title: 'Petishon di oferta',
            text: 'Petishon ku bishitante ta manda for di e páginanan di destinashon. Loke e bishitante a manda no por kambia, djis e status.',
          },
          filters: {
            title: 'Buska i filtra',
            text: 'Buska pa nòmber, e-mail òf destinashon. Status ta mustra por ehèmpel djis e petishonnan nobo.',
          },
          table: {
            title: 'E lista',
            text: 'Petishonnan nobo ta marká. Klek riba un nòmber pa lesa henter e petishon i e dokumento.',
          },
          open: {
            title: 'Atendé ku un',
            text: 'Manda e oferta pa e-mail, despues pone e status:',
            points: [
              'New: no a mir\'é ainda',
              'Quote sent: e oferta a bai',
              'Accepted òf Declined: loke e kliente a disidí',
            ],
          },
        },
        // The Bookings page tour (pageTours.dashboardBookings).
        dashboardBookings: {
          intro: {
            title: 'Bùk',
            text: 'Formularionan di bùk for di e website. Loke e remitente a yena ta djis pa lesa; number di enviamentu, volumen, peso i e kontrol di empake abo ta yena.',
          },
          filters: {
            title: 'Buska i filtra',
            text: 'Buska pa number di enviamentu, remitente, risibidó òf kontenido.',
          },
          table: {
            title: 'E lista',
            text: 'Bùknan nobo ta marká. Habri un bùk pa mira e datos i yena bo kamponan.',
          },
          status: {
            title: 'E status',
            text: 'Kon un bùk ta sigui:',
            points: [
              'Confirmed: ta pasa di "Mi bùknan" pa "Mi enviamentunan" di e kliente',
              'Shipped: e kliente ta mira e enviamentu komo "Na kaminda"',
              'Cancelled: ta kansel\'é',
            ],
          },
        },
        // The Messages page tour (pageTours.dashboardMessages).
        dashboardMessages: {
          intro: {
            title: 'Mensahe',
            text: 'Tur loke ta drenta via e formulario di kontakto.',
          },
          filters: {
            title: 'Buska i filtra',
            text: 'Buska pa nòmber, e-mail òf tema. Handled ta mustra djis loke no a wòrdu atendí ainda.',
          },
          table: {
            title: 'Atendé ku un',
            text: 'Habri un mensahe i kontestá pa e-mail. Despues usa Mark handled, pa bo koleganan sa ku e ta kla.',
            note: 'Marká komo atendí no ta manda nada pa e kliente.',
          },
        },
        // The Packages page tour (pageTours.dashboardPackages).
        dashboardPackages: {
          intro: {
            title: 'Pakete',
            text: 'E enviamentunan di tur kliente. Pakete nobo ta wòrdu traha den Django admin.',
          },
          filters: {
            title: 'Buska i filtra',
            text: 'Buska pa number di tracking, deskripshon òf kliente, i filtra pa status. Un number di tracking kompleto den e bara ariba ta habri e pakete mesora.',
          },
          table: {
            title: 'E lista',
            text: 'Pa kada pakete: tracking, kliente, destinashon, peso i balor, fecha i status. Paketenan ku ta warda riba bo ta marká. History ta mustra ken a hasi kiko.',
          },
          status: {
            title: 'Kambia e status',
            text: 'Skohe e status nobo den e fila di e pakete:',
            points: [
              'Quote sent, Paid (un faktura ta wòrdu traha di su mes), Products purchased',
              'Ready for shipping, In transit, Arrived at destination, Delivered',
              'Na In transit i Delivered e fecha ta wòrdu yená di su mes',
            ],
            note: 'Un pakete ku a sali no por kambia mas; un kompra despues ta bai riba un enviamentu nobo.',
          },
        },
        // The Measurements page tour (pageTours.dashboardMeasurements).
        dashboardMeasurements: {
          intro: {
            title: 'Medida',
            text: 'Loke e pakus a midi i pisa, pa kada formulario di intake.',
          },
          filters: {
            title: 'Buska i filtra',
            text: 'Buska pa referensia, suplidó, remitente òf destinashon, i filtra pa status i vrachi (laman òf aire).',
          },
          table: {
            title: 'E lista',
            text: 'Pa kada formulario: liña, colli, m³, peso i peso kobrabel. Totalnan ta konta djis liñanan kompleto. Habri un formulario pa kambia su liñanan.',
          },
        },
        // The Documents page tour (pageTours.dashboardDocuments).
        dashboardDocuments: {
          intro: {
            title: 'Dokumento',
            text: 'Loke kliente ta subi riba nan página di perfil: resibu, faktura di tienda, formulario di aduana.',
          },
          filters: {
            title: 'Buska i filtra',
            text: 'Buska pa kliente, nota, nòmber di archivo òf number di tracking. Kind ta skohe e tipo di dokumento; Filed ta mustra loke no ta riba un enviamentu ainda.',
          },
          table: {
            title: 'Pega na un enviamentu',
            text: 'Un dokumento por yega promé ku e pakete. Skohe e enviamentu korekto den e kolom Shipment apenas e pakete ta bùk.',
          },
        },
        // The Workers page tour (pageTours.dashboardWorkers).
        dashboardWorkers: {
          intro: {
            title: 'Trahadó',
            text: 'Tur hende ku ta traha aki, agrupá pa ròl. E ròl ta disidí ken por habri e dashboard, e skèner di pakus, òf ningun.',
          },
          new: {
            title: 'New colleague',
            text: 'Traha un kuenta pa un kolega i skohe su ròl. Nan ta haña un e-mail pa skohe nan mes kontraseña.',
            note: 'Ta djis un atministradó ta mira e boton aki.',
          },
          code: {
            title: 'Send sign-in code',
            text: 'Ta manda un trahadó di pakus un kódigo di kuater sifra. E ta traha un biaha, pa 15 minüt. Mesora despues nan ta skohe nan mes PIN pa e aparatonan di vloer.',
          },
          table: {
            title: 'E lista',
            text: 'Pa kada trahadó: datos, ròl i status di PIN.',
            points: [
              'PIN set, No PIN òf PIN locked',
              'Reset PIN: pa un PIN lubidá òf blokiá; despues manda un kódigo nobo',
              'Role: ta djis un atministradó por kambia ròl',
            ],
          },
        },
        // The WarehouseAccess page tour (pageTours.dashboardWarehouseAccess).
        dashboardWarehouseAccess: {
          intro: {
            title: 'Akseso di pakus',
            text: 'Kiko trahadónan di pakus por mira i usa den e app di pakus. Ofisina i atministradó nunka ta limitá.',
          },
          switches: {
            title: 'Paga i sende',
            text: 'Paga un parti i e ta disparsé for di nan pantaya; e server ta nenga e tambe. Skan, e lista di pakete i e página di pakete semper ta keda sendé.',
            note: 'Ta djis un atministradó por kambia esaki.',
          },
        },
        // The FloorDevices page tour (pageTours.dashboardFloorDevices).
        dashboardFloorDevices: {
          intro: {
            title: 'Aparato di vloer',
            text: 'Telefòn i skèner kompartí kaminda un trahadó di pakus ta drenta dor di tek su nòmber i tek su PIN. Un PIN ta traha djis riba e aparatonan aki.',
          },
          register: {
            title: 'Register this device',
            text: 'Habri e página aki riba e aparato mes, dun\'é un nòmber (por ehèmpel "Telefòn di mesa di empake") i registr\'é.',
          },
          table: {
            title: 'Aparato',
            text: 'Tur aparato registrá. Klek Revoke riba un ku a pèrdè òf ta daña; PIN no ta traha riba dje mas.',
          },
          log: {
            title: 'Ken a drenta unda',
            text: 'Ken a drenta riba kua aparato, i ki ora. Útil ora ta parse ku un hende ta traha bou di nòmber di un otro.',
          },
        },
        // The Shops page tour (pageTours.dashboardShops).
        dashboardShops: {
          intro: {
            title: 'Tienda',
            text: 'E webshopnan riba e página di servisio. Loke bo warda ta keda mesora riba e website.',
          },
          add: {
            title: 'Agregá un tienda',
            text: 'Yena nòmber, link, deskripshon i logo, i warda.',
          },
          table: {
            title: 'E lista',
            text: 'Edita un tienda den e tabla mes.',
            points: [
              '↑: ta subi un tienda den e òrdu',
              'Shown: kita e marka pa skonde e for di e website sin eliminá e',
            ],
          },
        },
        // The Blog page tour (pageTours.dashboardBlog).
        // Added 2026-10: the pages that had no tour yet (tutorialSteps.js).
        calculator: {
          intro: {
            title: "Kalkuladó di envio",
            text: "Yena unda e ta bai, kuantu e a kosta, e tamaño i peso, i bapor òf avion. Bo ta mira mesora un indikashon di e kostonan.",
          },
          result: {
            title: "E resultado",
            text: "Kada kosto ta aparesé ora su preis ta konosí. Bo ke un preis fiho? Pidi un oferta bou di e resultado; bo datonan ta yená kaba.",
          },
        },
        forgotPassword: {
          intro: {
            title: "Bo a lubidá bo kontraseña?",
            text: "Tek e adrès di e-mail di bo kuenta i nos ta manda bo un link pa skohe un kontraseña nobo.",
          },
          next: {
            title: "Despues",
            text: "Habri e e-mail i klek riba e link denter di un ora. No a haña e-mail? Wak den bo spam òf purba atrobe despues di algun minüt.",
          },
        },
        resetPassword: {
          intro: {
            title: "Skohe un kontraseña nobo",
            text: "Tek bo kontraseña nobo dos biaha. Usa por lo ménos 12 karakter, i no un ku bo ta usa na otro kaminda.",
          },
          next: {
            title: "Despues",
            text: "Pa seguridat bo a sali di tur kaminda. Drenta ku bo kontraseña nobo.",
          },
        },
        twoFactor: {
          intro: {
            title: "Kódigo for di bo app",
            text: "Despues di bo kontraseña, tek e kódigo di seis sifra for di bo app di autentikashon. E promé biaha bo ta skan un kódigo QR pa instal’é.",
          },
          lost: {
            title: "Bo telefòn a perde?",
            text: "Tek un di bo kódigonan di rekuperashon. No tin kódigo mas? Pidi un atministradó pa reset bo verifikashon di dos paso.",
          },
        },
        warehouseScan: {
          intro: {
            title: "Skaner",
            text: "Punta e kámara riba e kódigo di e kaha, òf tek e kódigo si e etiket ta daña.",
          },
          result: {
            title: "Kiko bo ta haña",
            text: "Skan un pakete ku nos tabata spera ta risibié outomátikamente. Despues habri’é pa midi, empaketá i pon’é kla.",
          },
        },
        warehousePackage: {
          intro: {
            title: "E pakete",
            text: "Kontrolá e datonan ku e etiket riba e kaha dilanti bo.",
          },
          steps: {
            title: "Paso pa paso",
            text: "Midi’é, agregá e empake i marka’é komo empaketá. E página ta mustra na kua paso bo ta.",
          },
          automatic: {
            title: "E status ta move su so",
            text: "Skan ta risibié, midi ta pas’é adelante, i ora e ta empaketá sin nada habrí e ta bira Kla pa manda. Usa Move to solamente pa korigí un fout.",
          },
          extra: {
            title: "Potrèt i historia",
            text: "Saka potrèt pa e kliente, reportá daño, i habri e historia i tur detaye abou.",
          },
        },
        warehouseIntake: {
          intro: {
            title: "Formulario di entrada",
            text: "E formulario pa merkansia ku ta yega, den e mesun òrdu ku e formulario di papel.",
          },
          release: {
            title: "Entregá",
            text: "Ora e formulario ta kompleto, entreg’é: ofisina ta hañ’é i e envio por wòrdu faktur.",
          },
        },
        warehouseProfile: {
          intro: {
            title: "Bo página",
            text: "Ku kua kuenta bo a drenta, kiko bo a entregá i e formularionan ku ta warda bo ainda.",
          },
          tools: {
            title: "Hèrmèntnan útil",
            text: "E kalkuladó, e setting di e e-mail di entrega i bo kontraseña ta aki tambe.",
          },
        },
        warehousePin: {
          intro: {
            title: "Bo pin",
            text: "Skohe un pin di 4 sifra. Kuné bo ta drenta riba e aparatonan di pakus dor di tòk bo nòmber.",
          },
        },
        dashboardInvoiceEditor: {
          intro: {
            title: "Editor di faktura",
            text: "Skohe e kliente i e envio, i yena e kostonan. E totalnan ta wòrdu kalkulá pa bo.",
          },
          preview: {
            title: "Bista previo",
            text: "E faktura na banda drechi ta eksaktamente loke ta wòrdu imprimí. Download òf imprimié ku e bòtonnan bou di e formulario.",
          },
          save: {
            title: "Warda",
            text: "Warda’é pa revishon, òf mand’é mesora na e kliente.",
          },
        },
        dashboardInvoiceSettings: {
          intro: {
            title: "Setting di faktura",
            text: "Datonan di kompania, di banko i tekstonan ku ta riba tur faktura. Un kambio ta konta pa fakturanan trahá di awor padilanti.",
          },
        },
        dashboardPreAlerts: {
          intro: {
            title: "Pre-alertanan",
            text: "Paketenan ku klientenan a bisa ta riba kaminda pa nos pakus.",
          },
          filters: {
            title: "Buska i filtra",
            text: "Buska riba referensia, number di tracking, kliente òf tienda, òf filtra riba estado.",
          },
        },
        dashboardCourierTracking: {
          intro: {
            title: "Sigui e kurier",
            text: "Tur number di kurier: ta drenta pa nos pakus i ta sali pa e isla.",
          },
          filters: {
            title: "Buska i filtra",
            text: "Buska riba number di tracking, kliente òf tienda, òf mustra solamente problema.",
          },
          details: {
            title: "Habri un enbio",
            text: "Klik riba un number di tracking: mira loke e kliente ta mira, agregá un aktualisashon, korigí un robes òf korigí e number mes.",
          },
        },
        dashboardSecurity: {
          intro: {
            title: "Seguridat",
            text: "Disidí si verifikashon di dos paso ta pagá, opshonal òf obligatorio.",
          },
          modes: {
            title: "E modonan",
            text: "Instal’é riba bo mes kuenta promé. Warda ta pidi bo kontraseña i ta mustra ken ta afektá.",
          },
          history: {
            title: "Historia",
            text: "Tur kambio na verifikashon di dos paso ta na final di e página.",
          },
        },
        driver: {
          intro: {
            title: "Bo entreganan",
            text: "E envionan ku mester wòrdu entregá, ku e telefòn i adrès di e kliente un tòk leu.",
          },
          deliver: {
            title: "Entregá",
            text: "Tòk Entregá, yena ken a tum’é i, si bo por, saka un potrèt. Awe ta mustra kiko bo a entregá.",
          },
        },
        dashboardBlog: {
          intro: {
            title: 'Blog',
            text: 'E artíkulonan riba e blog di e website.',
          },
          new: {
            title: 'New post',
            text: 'Skirbi un artíkulo nobo. Laga Published sin marka miéntras e ta un konsepto; konseptonan ta skondí pa bishitante.',
          },
          table: {
            title: 'E lista',
            text: 'Klek riba un artíkulo pa edit\'é. Marka Published i warda: e ta riba /blog mesora.',
          },
        },
        faq: {
          topics: { title: 'E temanan', text: 'Klek riba un tema, manera "Manda un outo" of "Pago", pa mira e preguntanan i kontestanan. Klek atrobe pa sera e.' },
          important: { title: 'Dokumento pa doana', text: 'Lesa esaki promé ku bo manda algu: sin e dokumentonan korekto nos no por manda bo merkansia.' },
          more: { title: 'Bo no a haña bo pregunta?', text: 'Tuma kontakto ku nos, nos ta yuda bo ku gustu.' },
        },
        blog: {
          intro: { title: 'E blog', text: 'Akinan nos ta skirbi konseho i splikashon tokante kumpra i manda kos pa e islanan.' },
          posts: { title: 'E artíkulonan', text: 'Klek riba un artíkulo pa lesa e kompleto.' },
        },
        blogPost: {
          article: { title: 'E artíkulo', text: 'Ariba bo ta mira e fecha i un resumen kòrtiku, i abou e artíkulo kompleto.' },
          cta: { title: 'Kla pa manda?', text: 'Mira e destinonan of tuma kontakto ku nos.' },
          back: { title: 'Lesa mas', text: 'E link aki ta hiba bo bèk na tur e artíkulonan.' },
        },
        terms: {
          note: { title: 'Na Ingles', text: 'E kondishonnan ta na Ingles. Si nan ta diferente for di e teksto Hulandes, e teksto Hulandes ta desisivo.' },
          contents: { title: 'Kontenido', text: 'Klek riba un artíkulo pa bai direkt n’e.' },
          conditions: { title: 'E kondishonnan', text: 'Promé e kondishonnan di ekspedishon, ku ta bal pa kada envio. Despues e kondishonnan di warda, pa warda den nos pakus.' },
          contact: { title: 'Preguntanan?', text: 'Algu no ta kla? Tuma kontakto ku nos.' },
        },
        privacy: {
          intro: { title: 'Bo datonan', text: 'Kiko datonan nos ta kolektá, pakiko, ku ken nos ta kompartí nan i kuantu tempu nos ta warda nan.' },
          contact: { title: 'Pregunta tokante bo datonan?', text: 'Tuma kontakto ku nos si bo tin un pregunta tokante bo datonan.' },
        },
        services: {
          intro: { title: 'Nos servisionan', text: 'E página aki ta splika kiko nos ta hasi pa bo, for di nos warehouse na Hulanda te na entrega riba e isla.' },
          islands: { title: 'E islanan', text: 'Klek riba un isla pa mira kon manda pa ei ta funshoná, kuantu tempu e ta tuma, i pa pidi un preisnota.' },
          offer: { title: 'Kiko nos ta hasi pa bo', text: 'Fleta pa laman i pa aire, risibí i kombiná bo paketenan, aduana, i entrega riba e isla.' },
          partners: { title: 'Nos sosionan', text: 'E kompanianan ku nos ta traha kuné pa hiba bo enbio riba e isla.' },
          contact: { title: 'Bo tin pregunta?', text: 'Bo ke sa kiko nos por hasi pa bo? Ku e boton aki bo ta tuma kontakto ku nos.' },
        },
        booking: {
          intro: { title: 'E formulario di boeking', text: 'Akinan bo ta anunsiá bo enbio serka nos, en bes di riba papel. Nos ta yena e number di enbio, e volumen i e peso ora bo enbio yega serka nos.' },
          mode: { title: 'Normal òf paso pa paso', text: 'Skohe "Formulario normal" pa yena tur kos riba un página, òf "Paso pa paso" pa hasi un parti pa biaha. Loke bo a yena kaba ta keda ora bo kambia.' },
          shipment: { title: 'Bo enbio', text: 'Skohe kon bo ta manda (pa laman òf pa aire) i pa unda.' },
          people: { title: 'Remitente i risibidó', text: 'Yena bo mes informashon akinan, i abou esun di e persona ku ta risibí riba e isla.' },
          consignment: { title: 'Kiko bo ta manda', text: 'Pa kada tienda, skohe unda bo a hasi òrdu i kiko bo a kumpra einan, si bo ke ku un screenshot di bo òrdu.' },
          insurance: { title: 'Seguro i remarke', text: 'Bo ke asegurá e enbio? Yena su balor; ku "Kon e seguro ta funshoná?" bo ta mira kuantu e ta kosta. Akinan bo por laga un remarke pa nos tambe.' },
          terms: { title: 'Kondishon i firma', text: 'Aseptá e kondishonnan, skirbi bo nòmber komo firma i manda e formulario.' },
        },
        contact: {
          methods: { title: 'Kon pa yega na nos', text: 'Manda nos un e-mail, yama nos òf pasa serka nos. Klek riba un di e tres pa manda e-mail, yama, òf mira e kaminda.' },
          form: { title: 'Manda nos un mensahe', text: 'Bo ta preferá skirbi? Yena e formulario aki. Nos ta kontestá pa e-mail.' },
        },
        destinations: {
          list: { title: 'Skohe bo isla', text: 'Klek riba un isla. Ei bo por lesa kuantu tempu e enbio ta tuma i kon e ta funshoná, i pidi un preisnota.' },
        },
        destination: {
          facts: { title: 'Na kòrtiku', text: 'Kuantu tempu e biahe ta tuma, unda bo enbio ta yega i kon e entrega ta bai.' },
          how: { title: 'Asina bo order ta yega', text: 'Paso pa paso: for di bo order na Hulanda te na entrega riba e isla aki.' },
          faq: { title: 'Preguntanan frekuente', text: 'Kontestanan riba loke hende ta puntra mas tokante manda pa e isla aki. Klek riba un pregunta pa lesa e kontesta.' },
          quote: { title: 'Pidi un preisnota', text: 'Yena bo nòmber i direkshon di e-mail, upload bo faktura i manda e petishon. Nos ta manda bo un preis indikativo pa e-mail.' },
        },
        profile: {
          details: { title: 'Bo informashon', text: 'Bo nòmber, e-mail, number di telefòn i adres di entrega. Tene nan al dia pa nos por yega na bo.' },
          address: { title: 'Bo adrès di entrega', text: 'Yena e adrès aki komo adrès di entrega pa kada òrdu den un webshop, pa e pakete yega na nos pakus. Pone bo mes nòmber na "nòmber" i "Pay less Shop More" na "fam". E boton banda di un liña ta kopia e liña ei, òf kopia henter e adrès un biaha.' },
          tracking: { title: 'Track & Trace', text: 'Sigui bo enbio akinan. E informashon ta aparesé apenas e ta disponibel pa bo enbio.' },
          shipments: { title: 'Mi enbionan', text: 'Tur bo enbionan riba un lista, ku unda kada un ta awor.' },
          prealert: { title: 'Avisá un pakete promé', text: 'Tin un pakete ta bini na nos pakus? Avisá nos aki ku e number di tracking, e kurier, e tienda i kiko tin aden. No ta nesesario mas pa duna un balor. Agregá e faktura di e tienda, anto duana ta bai mas lihé.' },
          handover: { title: 'Entregá òf bin buska', text: 'Klek riba un enbio i skohe kon bo ke risibí e: "Entregá" òf "Mi ta bin buska e". Bo ta skohe un biaha so: promé nos ta puntra si bo ta sigur, despues e skohe ta fiho. Bo ke kambi\'é despues tòg? Klek riba nos adrès di e-mail den e enbio; e tópiko ku bo number di enbio ta yená kaba.' },
          bookings: { title: 'Mi boekingnan', text: 'Tur loke bo a manda nos ku e formulario di boeking. Klek riba un boeking pa mira kiko bo a yena.' },
          invoices: { title: 'Mi fakturanan', text: 'Akinan bo ta haña nos fakturanan pa bo enbionan, pa wak òf deskargá.' },
          notifications: { title: 'Notifikashon', text: 'Skohe kua e-mail bo ke risibí di nos.' },
        },
        prealert: {
          intro: { title: 'Avisá un pakete promé', text: 'Tin un pakete ta bini na nos pakus? Avisá nos aki, pa nos sa ku e ta di bo apenas e yega. E kashinan ku un * ta obligatorio.' },
          courier: { title: 'Number di tracking i kurier', text: 'E number di tracking i e kompania di kurier (PostNL, DHL, DPD ...) ta den e e-mail di enbio di e tienda. Ku esei nos ta sigui e pakete te na nos pakus.' },
          shop: { title: 'E tienda', text: 'Skohe e tienda kaminda bo a kumpra. No ta den e lista? Skohe "Otro tienda…" i tek su nòmber.' },
          description: { title: 'Kiko tin aden?', text: 'Splika kòrtiku kiko tin den e pakete, por ehèmpel "1 motherboard i 1 power supply". No ta nesesario pa duna un balor.' },
          receiver: { title: 'Risibidó', text: 'Bo nòmber ta yená kaba. Un otro hende ta risibí e pakete? Yena anto su nòmber.' },
          invoice: { title: 'E faktura', text: 'Agregá e faktura òf konfirmashon di òrdu di e tienda: un PDF òf potrèt, te 5 archivo. No ta obligatorio, pero duana ta bai mas lihé kuné.' },
          confirm: { title: 'Konfirmá i manda', text: 'Marka ku bo a lesa e lista di artíkulonan ku nos no ta manda, i klek riba "Manda pre-alerta". Despues bo ta haña e den bo kuenta na "Mi enbionan".' },
        },
        login: {
          form: { title: 'Drenta', text: 'Yena e direkshon di e-mail i e kontraseña di bo kuenta.' },
          forgot: { title: 'Bo a lubidá bo kontraseña?', text: 'Klek akinan. Nos ta manda bo un link pa skohe un kontraseña nobo.' },
          signup: { title: 'Ainda bo no tin kuenta?', text: 'Traha un akinan grátis. E ta tuma mas o ménos un minüt.' },
        },
        signup: {
          form: { title: 'Bo informashon', text: 'Yena bo mes nòmber, e-mail i number di telefòn.' },
          password: { title: 'Skohe un kontraseña', text: 'Skohe un kontraseña fuerte. Ku e wowo bo por mira kiko bo ta tek.' },
          terms: { title: 'Aseptá i kla', text: 'Aseptá e kondishonnan i klek riba e boton pa traha bo kuenta.' },
        },
        tutorial: {
          player: { title: 'E gia, paso pa paso', text: 'Usa "Siguiente" i "Atras" pa pasa dor di e pasonan. Ku "Lesa na bos haltu" e robot ta lesa e paso pa bo.' },
          written: { title: 'Tur paso na skirbi', text: 'E mesun pasonan un tras di otro, pa lesa kalmo òf pa imprimí.' },
          cta: { title: 'Kla pa kuminsá?', text: 'Anunsiá bo enbio, òf tuma kontakto ku nos si bo tin pregunta ainda.' },
        },
      },
      helpButton: {
        label: 'Yudansa',
        menuLabel: 'Yudansa',
        pageTour: 'Tur dor di e página aki',
        shipping: 'Informashon di enbio',
        howToOrder: 'Kon pa ordená',
        track: 'Kon pa sigui mi pakete',
        contact: 'Tuma kontakto',
      },
    },
    tutorial: {
      eyebrow: 'GIA',
      title: 'Kon e ta funshoná',
      breadcrumb: 'Gia',
      lead:
        'Nos asistente ta kana paso pa paso ku bo: for di bo kuenta te na entrega riba e isla. Bo ke skucha mihó? Primi "Lesa na bos haltu".',
      playerLabel: 'Gia paso pa paso',
      stepWord: 'Paso',
      previous: 'Atras',
      next: 'Siguiente',
      restart: 'Kuminsá di nobo',
      playVoice: 'Lesa na bos haltu',
      stopVoice: 'Stop di lesa',
      voiceUnavailable:
        'Bo browser no por lesa e gia aki na bos haltu. E teksto kompletu ta pará abou.',
      writtenTitle: 'Tur paso na skirbi',
      writtenLead:
        'Tur e pasonan un tras di otro, pa lesa kalmo òf pa imprimí.',
      address: {
        firstName: 'Nòmber',
        firstNameValue: 'Bo mes nòmber',
        lastName: 'Fam',
        street: 'Adres',
      },
      ctaTitle: 'Kla pa kuminsá?',
      ctaBody:
        'Anunsiá bo enbio òf hasi nos bo pregunta — nos ta yuda bo ku gusto.',
      ctaPrimary: 'Anunsiá enbio',
      ctaSecondary: 'Tuma kontakto',
      steps: {
        account: {
          title: 'Habri un kuenta',
          body:
            'Ku un kuenta bo ta mira bo enbionan, boekingnan, adresnan i fakturanan na un solo lugá. Registrá ta dura un minüt i ta grátis.',
          action: 'Habri un kuenta',
        },
        quote: {
          title: 'Pidi un preis',
          body:
            'Bisa nos kiko bo ke manda i pa ki isla. Bo ta risibí un preis indikativo na midí, basá riba peso i volúmen.',
          bullets: [
            'Skohe bo destinashon: Aruba, Boneiru òf Kòrsou. Nos ta manda tambe na otro paisnan den Karibe i Amérika Latino; mira Destinashonnan.',
            'Bisa nos mas presis posibel kiko bo ta manda i ki grandi e ta.',
            'Nos ta manda bo e preis i e posibilidatnan di enbio pa e-mail.',
          ],
          action: 'Pidi un preis',
        },
        order: {
          title: 'Hasi bo òrdu na e tienda ku bo skohe',
          body:
            'Hasi bo òrdu na kasi tur webshop hulandes. Bo mes ta hasi e òrdu, ku bo mes kuenta na e tienda.',
          note: 'Paga e òrdu mesora. Paga despues no ta permití.',
          action: 'Mira nos servisionan',
        },
        invoice: {
          title: 'Usa nos adres komo adres di entrega',
          body:
            'Ora bo ta paga, yena nos pakus komo adres di entrega, eksaktamente manera ta pará aki bou. Ku bo mes nòmber riba dje, nos sa di ken e pakete ta ora e yega. E adres pa kopia ta den bo kuenta tambe, na "Bo adrès di entrega".',
          note:
            'Tene kuenta: si un pakete yega ku un otro adres òf nòmber, nos no sa ku e ta di bo.',
        },
        announce: {
          title: 'Anunsiá bo enbio serka nos',
          body:
            'Avisá e pakete promé den bo kuenta: e number di tracking, e kurier, e tienda i kiko tin aden. No ta nesesario pa duna un balor. Agregá e faktura di e tienda, anto duana ta bai mas lihé.',
          action: 'Avisá un pakete',
        },
        warehouse: {
          title: 'Nos ta risibí i traha ku bo pakete',
          body:
            'Den nos depósito na Berkel en Rodenrijs nos ta registrá bo pakete, midi i pisa e, i pone e kla pa manda. Paketenan suelto nos por uni den un solo enbio. Bo ta mira e peso, e midínan i potrèt di bo pakete serka e enbio den bo kuenta.',
        },
        track: {
          title: 'Sigui bo enbio',
          body:
            'Ora bo enbio ta na kaminda, bo ta sigui kada paso ku Track & Trace den bo kuenta.',
          action: 'Sigui bo enbio',
        },
        delivery: {
          title: 'Entrega riba e isla',
          body:
            'Na destinashon bo enbio ta wòrdu entregá òf ta keda kla pa bo bin buska. Bo mes ta skohe den bo kuenta, serka e enbio: "Entregá" òf "Mi ta bin buska e". Bo ta skohe un biaha so; si bo ke kambi\'é despues, manda nos un e-mail. Kada destinashon tin su mes splikashon.',
          action: 'Mira destinashonnan',
        },
      },
    },
    // The blog (src/pages/Blog). The articles themselves are written by the
    // office in the dashboard; these are only the page's own words.
    // NOTE: needs review by a native speaker.
    blog: {
      title: 'Blog',
      lead: 'Tip i splikashon tokante ordená na Hulanda i manda pa e islanan.',
      empty: 'Ainda no tin artíkulo. Bin bek pronto!',
      readMore: 'Lesa mas',
      back: 'Tur artíkulo',
      notFound: 'Artíkulo no a wordu hañá',
      notFoundText: 'E artíkulo aki no ta eksistí (mas). Wak e otro artíkulonan riba e blog.',
      otherLanguage: 'E artíkulo aki no ta tradusí (ainda) i ta aki na',
      languages: { nl: 'Hulandes', en: 'Ingles', pap: 'Papiamentu' },
      ctaTitle: 'Kla pa ordená?',
      ctaQuote: 'Pidi un preisnota',
      ctaContact: 'Tuma kontakto',
    },
    footer: {
      tagline:
        'Kumpra ku mas sabiduria, spar mas. Kompará preis i haña e mihó ofertanan na un solo lugá.',
      navigation: 'Navegashon',
      company: 'Kompania',
      legal: 'Legal',
      about: 'Tokante nos',
      blog: 'Blog',
      faq: 'Preguntanan frekuente',
      privacy: 'Polítika di privasidat',
      terms: 'Terminonan i kondishonnan',
      social: 'Medionan sosial',
      footerNav: 'Navegashon di footer',
      rights: 'Tur derecho reservá.',
      madeIn: 'Trahá na Hulanda',
    },
  },
};

// SPELLING NOTE: Papiamentu has two written standards — the phonetic spelling
// used on Curaçao and Bonaire (Kòrsou, Boneiru), and the etymological spelling
// used on Aruba (Papiamento: Corsou, Bonaire). This file uses the Curaçao and
// Bonaire standard, since those are the islands the site ships to. If Aruba
// becomes a target market, that is a separate locale, not a tweak to this one.
