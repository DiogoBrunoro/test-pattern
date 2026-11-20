import { CheckoutService } from '../src/services/CheckoutService.js';
import { Item } from '../src/domain/Item.js';
import { Pedido } from '../src/domain/Pedido.js';
import { UserMother } from './builders/UserMother.js';
import { CarrinhoBuilder } from './builders/CarrinhoBuilder.js';

describe('CheckoutService', () => {
    const cartao = { numero: '4111111111111111', cvv: '123' };

    describe('quando o pagamento falha', () => {
        it('deve retornar null e não salvar o pedido nem enviar e-mail', async () => {
            // Arrange
            const carrinho = CarrinhoBuilder.umCarrinho().build();
            const gatewayStub = { cobrar: jest.fn().mockResolvedValue({ success: false }) };
            const repositoryDummy = { salvar: jest.fn() };
            const emailDummy = { enviarEmail: jest.fn() };
            const checkoutService = new CheckoutService(gatewayStub, repositoryDummy, emailDummy);

            // Act
            const pedido = await checkoutService.processarPedido(carrinho, cartao);

            // Assert (Verificação de Estado)
            expect(pedido).toBeNull();
            expect(repositoryDummy.salvar).not.toHaveBeenCalled();
            expect(emailDummy.enviarEmail).not.toHaveBeenCalled();
        });
    });

    describe('quando um cliente Premium finaliza a compra', () => {
        it('deve cobrar com 10% de desconto e enviar e-mail de confirmação', async () => {
            // Arrange
            const usuarioPremium = UserMother.umUsuarioPremium();
            const carrinho = CarrinhoBuilder.umCarrinho()
                .comUser(usuarioPremium)
                .comItens([new Item('Fone', 120), new Item('Mouse', 80)]) // R$ 200,00
                .build();

            const gatewayStub = { cobrar: jest.fn().mockResolvedValue({ success: true }) };
            const pedidoSalvo = new Pedido(42, carrinho, 180, 'PROCESSADO');
            const repositoryStub = { salvar: jest.fn().mockResolvedValue(pedidoSalvo) };
            const emailMock = { enviarEmail: jest.fn().mockResolvedValue(undefined) };
            const checkoutService = new CheckoutService(gatewayStub, repositoryStub, emailMock);

            // Act
            const pedido = await checkoutService.processarPedido(carrinho, cartao);

            // Assert (Verificação de Comportamento)
            expect(gatewayStub.cobrar).toHaveBeenCalledWith(180, cartao);
            expect(emailMock.enviarEmail).toHaveBeenCalledTimes(1);
            expect(emailMock.enviarEmail).toHaveBeenCalledWith(
                'premium@email.com',
                'Seu Pedido foi Aprovado!',
                'Pedido 42 no valor de R$180'
            );
            expect(pedido).toBe(pedidoSalvo);
        });
    });

    describe('quando um cliente Padrão finaliza a compra', () => {
        it('deve cobrar o valor cheio, sem desconto', async () => {
            // Arrange
            const carrinho = CarrinhoBuilder.umCarrinho()
                .comUser(UserMother.umUsuarioPadrao())
                .comItens([new Item('Teclado', 200)])
                .build();
            const gatewayStub = { cobrar: jest.fn().mockResolvedValue({ success: true }) };
            const repositoryStub = { salvar: jest.fn().mockResolvedValue(new Pedido(7, carrinho, 200, 'PROCESSADO')) };
            const emailMock = { enviarEmail: jest.fn().mockResolvedValue(undefined) };
            const checkoutService = new CheckoutService(gatewayStub, repositoryStub, emailMock);

            // Act
            const pedido = await checkoutService.processarPedido(carrinho, cartao);

            // Assert
            expect(gatewayStub.cobrar).toHaveBeenCalledWith(200, cartao);
            expect(pedido.totalFinal).toBe(200);
        });
    });

    describe('quando o envio de e-mail falha', () => {
        it('não deve falhar o checkout e deve retornar o pedido salvo', async () => {
            // Arrange
            const carrinho = CarrinhoBuilder.umCarrinho().build();
            const gatewayStub = { cobrar: jest.fn().mockResolvedValue({ success: true }) };
            const pedidoSalvo = new Pedido(9, carrinho, 100, 'PROCESSADO');
            const repositoryStub = { salvar: jest.fn().mockResolvedValue(pedidoSalvo) };
            const emailStub = { enviarEmail: jest.fn().mockRejectedValue(new Error('SMTP fora do ar')) };
            jest.spyOn(console, 'error').mockImplementation(() => {});
            const checkoutService = new CheckoutService(gatewayStub, repositoryStub, emailStub);

            // Act
            const pedido = await checkoutService.processarPedido(carrinho, cartao);

            // Assert
            expect(pedido).toBe(pedidoSalvo);
            console.error.mockRestore();
        });
    });
});
