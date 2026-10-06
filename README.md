# Laboratori AM

Laboratori educatiu en català de modulació d’amplitud, sense dependències.

## Prova local

```sh
python3 -m http.server 8000 --bind 127.0.0.1
```

Obre http://127.0.0.1:8000. Cal servir els fitxers per HTTP; no obrir
`index.html` directament. El micròfon funciona a localhost o amb HTTPS.

- **To pur:** ajusta freqüències i índex; compara la moduladora i la recuperada.
- **Veu:** grava cinc segons, escolta l’original, l’original filtrada a 3 kHz
  i la recuperada. Canvia l’índex sense haver de tornar a gravar.
- Les gravacions romanen en memòria i es perden en recarregar la pàgina.

## Model

AM convencional amb portadora: `s(t) = [1 + μ·m(t)]·cos(2πfct)`.
La recuperació empra un model ideal d’envolupant `|1 + μ·m(t)|`, elimina
la component contínua i compensa el guany de μ (μ = 0 produeix silenci).
Per μ > 1, una envolupant que creua zero es plega i distorsiona el missatge.

L’àudio de veu es limita a 3 kHz abans de modular i es normalitza a un pic
unitari per definir μ. El receptor torna a filtrar a 3 kHz. El filtre offline
Butterworth s’aplica en tots dos sentits per evitar retard en la comparació,
amb el tall corregit a −3 dB. No representa el retard d’un receptor físic.
Els volums d’escolta s’ajusten segons RMS amb límit de pic; les gràfiques
temporals mantenen les amplituds del model.

La portadora de veu (100 kHz–1 MHz) es calcula analíticament per representar
un fragment RF de 50 μs. No es genera una portadora d’RF a la freqüència de
mostreig de l’àudio. La recuperació es calcula en banda base sota la hipòtesi
que la portadora és molt més alta que el missatge. Canviar la portadora no
canvia la qualitat de l’àudio en aquest model ideal, sense soroll ni
interferències. L’AM de doble banda lateral ocupa aproximadament 6 kHz
amb un missatge limitat a 3 kHz (els filtres tenen transició gradual).

## Comprovacions

```sh
npm test
```

Proves de recuperació, sobremodulació, silenci, tall del filtre i processament
de cinc segons. `recorder-worklet.js` captura PCM mono sense retorn del
micròfon als altaveus; s’atura després de cinc segons de mostres.

Per comprovar el recorregut complet sense un micròfon real, obre
http://127.0.0.1:8000/tests/voice-fixture.html i grava dins del laboratori
incrustat. Aquesta pàgina substitueix només la captura per dos tons de prova,
de 700 Hz i 6 kHz. La pàgina principal sempre usa el micròfon real.
