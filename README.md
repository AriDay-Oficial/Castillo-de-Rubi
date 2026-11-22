# El castillo de Rubi

TextRPG progresivo para navegador. Sales de la ciudad fortificada de Rubi y subes, piso a piso, un castillo de 100 plantas: combates por turnos, botín, equipo, habilidades y cinco jefes hasta el Rey de la catedral.

Es una web estática: HTML, CSS y JavaScript con módulos ES nativos, sin compilación ni dependencias. GitHub Pages publica la rama `main` tal cual.

## Cómo se juega

1. **Nueva partida**: elige nombre y género. Empiezas en Rubi con una poción, hierbas y una cuerda.
2. **Rubi (piso 0)**: posada para recuperarte, tienda de pociones y cuerdas, herrería para forjar y mejorar el equipo, y la entrada al castillo.
3. **Pisos**: pulsa *Explorar* para afrontar cada encuentro. Con el piso despejado se abre la escalera. Cada piso trae un suceso: un mercader, una patrulla (un combate extra con más oro), un altar (una oración que cura) o magia inestable (enemigos más fuertes, mejor recompensa).
4. **Combate por turnos**: tú actúas primero y después atacan los enemigos que sigan en pie.
   - *Atacar*, *Defender* (bloquea la mitad del daño), usar una poción o *Huir* (60 % de éxito, nunca ante un jefe).
   - Las **técnicas** gastan energía (máximo 5). La energía se recupera con cada enemigo derrotado, al bloquear el golpe devastador de un jefe, al descansar y al subir de nivel.
   - La etiqueta de peligro (fácil, moderado, peligroso, extremo) estima cuánto daño te hará el combate.
5. **Jefes** en los pisos 10, 25, 50, 75 y 100. Avisan un turno antes de su golpe devastador: defiéndete en ese turno. Una vez vencidos no vuelven.
6. **Refugios** en los pisos 11, 21, 31… 91: sin enemigos, con hoguera gratuita y viaje a Rubi de ida y vuelta.
7. **Volver a la ciudad**: desde un refugio, con una *cuerda* (guarda el piso y su progreso para regresar una vez) o retirándote (pierdes la posición y vuelves a entrar por el piso 1 o por un refugio).
8. **Progresión**: cada nivel da salud, ataque, defensa y un punto de habilidad. El botín se equipa solo si mejora lo que llevas; las piezas repetidas se venden y el oro se invierte en la herrería.
9. **Derrota**: pierdes la mitad del oro y despiertas en Rubi; conservas nivel, equipo y objetos.
10. **Victoria**: vence al Rey de la catedral en el piso 100.

La partida se guarda sola en el navegador (`localStorage`) después de cada acción, incluso en mitad de un combate; *Continuar* la retoma donde la dejaste. En *Ajustes* puedes exportarla como texto para llevarla a otro dispositivo, importarla o borrarla.

En escritorio, las teclas `1`–`9` activan las acciones principales de la pantalla.

## Ejecutarlo en local

Los módulos ES no cargan desde `file://`, así que hace falta un servidor estático cualquiera:

```bash
python3 -m http.server 8000
# o: npm start
```

Después abre <http://localhost:8000/>.

## Pruebas

La lógica pura (generación, reglas, combate, estado, guardado y partidas completas simuladas) se prueba con el runner nativo de Node 20 o superior, sin instalar nada:

```bash
npm test
# o: node --test
```

## Estructura

```
index.html            Esqueleto de la página
styles/main.css       Estilos
src/main.js           Arranque
src/content/          Datos: zonas, enemigos, jefes y objetos
src/procgen/          Generación con semilla de pisos y encuentros
src/core/             Estado, motor de reductores, bus de eventos y guardado
src/game/             Reglas, combate, objetos, habilidades y controlador de la partida
src/ui/               Pantallas (HTML) y controlador de la interfaz
tests/                Pruebas con node:test
```

Los valores de equilibrio están reunidos en `BALANCE` (`src/game/rules.js`).
