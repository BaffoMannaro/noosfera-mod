# Noosfera per Claude Code

La mod di Noosfera per Claude Code e per la tab Code dell'app di Claude, con i colori dello studio.

- **Pannello accanto alla chat**, a schede: Panoramica (numeri della settimana con il loro andamento, cose da fare, i tuoi progetti), Social (visualizzazioni giorno per giorno su Instagram e Facebook, i clienti), Siti (stato e avvisi), Piani (scadenze e prossime uscite) e Consumi (il tuo limite del mese, le spese per attività e quelle del team). Le schede Social, Siti e Piani compaiono a chi ha la sezione Dashboard.
- **Agenti sopra il prompt**: Lilla, Otto, Rocco e Bea con la loro illustrazione. Scegli un agente e uno dei suoi lavori, e la richiesta è pronta nel campo, mai inviata da sola.
- **Agenti al lavoro**: mentre un agente lavora, il pannello mostra a che passo è, con la barra di avanzamento calcolata sui passi del suo lavoro, il tempo, i token e la spesa della sessione.

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
- Gli agenti sopra il prompt si scelgono con un clic o con i tasti numerici; «Nascondi» li toglie, `/noosfera` li rimette.

## Modalità Auto

Con la modalità di permessi Auto, Claude Code blocca la lettura del pannello finché non la permetti, perché la chiamata al connettore non nasce da una tua richiesta. Il pannello lo dice e ha il pulsante «Prepara la richiesta»: invii il messaggio e Claude aggiunge alle tue impostazioni il permesso per lo strumento `studio_run` del connettore di Noosfera, una volta sola. Se la modalità Auto non glielo lascia fare, passa per un momento alla modalità normale, invia di nuovo e poi torna ad Auto. Con le altre modalità non serve niente.
