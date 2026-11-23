// Script auxiliar dos testes do executor: sai com 7 quando a etapa é "package".
process.exit(process.argv[2] === 'package' ? 7 : 0);
