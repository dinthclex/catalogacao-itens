'use strict';
/* ==========================================================================
   VanishCam — inicialização final. Deve ser o último script carregado, pois
   depende de tudo que os demais arquivos definem (DOM, listeners, render()).
   ========================================================================== */

/* --------------------------------------------------------------------------
   HISTÓRICO DE ALTERAÇÕES DESTE ARQUIVO
   Este arquivo não sofreu nenhuma alteração desde a criação do projeto —
   continua chamando apenas resizeCanvas()/updateVisibilityRules()/render()
   uma vez, na carga da página, para deixar tudo no estado inicial correto.
   -------------------------------------------------------------------------- */
resizeCanvas();
updateVisibilityRules();
render();
