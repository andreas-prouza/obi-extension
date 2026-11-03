- Plattform: VSCode Extension
- Sprache: Typescript
- Sicherheit hat oberste Priorität.
  Sicherheitslücken müssen verhindert werden.
  Sicherheit geht vor Feature, außer es wird explizit anders entschieden.


# NPM

Packages müssen folgende Kriterien erfüllen:
* Keine Sicherheitsrisiken
* Hohen Bekanntheitsgrad
* Ein github repo muss existieren
* Im github repo müssen mehrere Forks und min. 200 Sterne hinterlegtsein

Sollte auf Grund der Kriterien kein Package gefunden werden, frag nach weiterem Vorgehen.  
Gib auch die Info aus welche Kriterien nicht erfüllt wurden.

Geprüfte Packages und genehmigte Ausnahmen: siehe [technik.md](technik.md#package-prüfung).


# GUI

* Icons sollen soweit wie Möglich von VSCode native Icons sein
* Verwende Icons für Buttons wenn möglich. Auch Icon + Text ist möglich
* Verwende HTML templates mit einer template engine (Jinja2)


# Updates

* Das `CHANGELOG.md` muss gepflegt werden


# Features

Located in `docs/features/`.

* Each feature has a status: `draft`, `ready` or `finished`