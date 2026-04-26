const generatePapeletaNumber = () => {
    const date = new Date();
    const year = date.getFullYear().toString().slice(-2); // Últimos dos dígitos del año
    const month = (`0${date.getMonth() + 1}`).slice(-2); // Mes con dos dígitos
    const randomNumber = Math.floor(1000 + Math.random() * 9000); // Número aleatorio de 4 dígitos

    return `PA-${year}${month}-${randomNumber}`;
};

module.exports = generatePapeletaNumber;
