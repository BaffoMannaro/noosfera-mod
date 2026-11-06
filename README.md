# Noosfera per Claude Code

La mod di Noosfera per Claude Code e per la tab Code dell'app di Claude. Accanto alla chat mostra il pannello «Noosfera» con la tua parte della dashboard: quanto hai usato del limite del mese, i tuoi ultimi progetti e, se hai la sezione Dashboard, i numeri della settimana, le cose da fare nei piani, le prossime uscite e i siti con avvisi. Sopra il campo del prompt propone gli agenti e le richieste che fanno al caso di quello che stai scrivendo: un clic e la frase è nel campo, mai inviata da sola.

I dati arrivano dal connettore di Noosfera che hai già collegato a Claude, con il tuo accesso: ognuno vede i suoi. La mod non contiene chiavi né dati. Senza un accesso a Noosfera il pannello resta vuoto.

## Installazione

Nell'app di Claude, tab Code: fai clic su **+** accanto al campo del prompt, poi **Plugins**, **Add marketplace** e scrivi `BaffoMannaro/noosfera-mod`, poi **Add plugin** su «noosfera».

Oppure scrivi a Claude, nella tab Code: «Installa il plugin noosfera dal marketplace BaffoMannaro/noosfera-mod», e premi Consenti quando lo chiede.

Da un terminale, al prompt di Claude Code:

```
/plugin install noosfera --marketplace BaffoMannaro/noosfera-mod
```

oppure dalla shell:

```bash
claude plugin install noosfera --marketplace BaffoMannaro/noosfera-mod
```

Serve il connettore di Noosfera collegato a Claude (indirizzo `https://studio.maurodev.it/api/mcp`).

## Uso

- Il pannello si apre da solo all'inizio di ogni sessione; `/noosfera` lo riapre e lo aggiorna.
- I suggerimenti sopra il prompt si scelgono con un clic o con i tasti 1, 2 e 3; «Nascondi» li toglie, `/noosfera` li rimette.

## Modalità Auto

Con la modalità di permessi Auto, Claude Code blocca la lettura del pannello finché non la permetti, perché la chiamata al connettore non nasce da una tua richiesta. Il pannello lo dice e ha il pulsante «Prepara la richiesta»: invii il messaggio e Claude aggiunge alle tue impostazioni il permesso per lo strumento `studio_run` del connettore di Noosfera, una volta sola. Se la modalità Auto non glielo lascia fare, passa per un momento alla modalità normale, invia di nuovo e poi torna ad Auto. Con le altre modalità non serve niente.
